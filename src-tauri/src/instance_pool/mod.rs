//! Invidious/Piped instance pool with health checks and auto-failover

use crate::types::*;
use crate::db::Database;
use tauri::{AppHandle, Manager};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use reqwest::Client;

/// Clone (manual impl below) shares the inner Arcs (instances map, database,
/// HTTP client), so the bare and `Arc<>` managed views in `lib.rs` behave as
/// one service.
pub struct InstancePool {
    pub instances: Arc<RwLock<HashMap<String, Instance>>>,
    client: Client,
    db: Arc<Database>,
    app_handle: AppHandle,
    pub auto_failover: Arc<RwLock<bool>>,
}

impl InstancePool {
    pub fn new(app_handle: AppHandle) -> Self {
        let db = app_handle.state::<Database>().inner().clone();
        
        Self {
            instances: Arc::new(RwLock::new(HashMap::new())),
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("Failed to create HTTP client"),
            db: Arc::new(db),
            app_handle,
            auto_failover: Arc::new(RwLock::new(true)),
        }
    }
    
    /// A video channel's avatar from an Invidious instance (live-test Task 10:
    /// "the should have small profile pictures").
    ///
    /// Tries the instances in the pool's own search order — the same precedence
    /// that decides which instance serves a search — and returns the first
    /// answer. None means no instance could answer, which is not an error: a
    /// channel without a visible avatar keeps its placeholder.
    pub async fn fetch_channel_art(&self, author_id: &str) -> Option<String> {
        let instances = self.get_all().await;
        for instance in order_for_search(&instances) {
            let art = crate::channel_art::fetch_author_thumbnail(
                &self.client,
                &instance.url,
                author_id,
                Duration::from_secs(10),
            )
            .await;
            if art.is_some() {
                return art;
            }
        }
        None
    }

    /// Load instances from the database into the in-memory pool. Health
    /// checking is NOT started here — `background_tasks` owns the single
    /// health-check loop (two loops would double-probe every instance).
    pub async fn initialize(&self) -> Result<(), String> {
        let instances = self.db.list_instances().await?;
        let mut instances_map = self.instances.write().await;

        for instance in instances {
            instances_map.insert(instance.id.clone(), instance);
        }

        Ok(())
    }
    
    pub async fn add(&self, instance: Instance) {
        let mut instances = self.instances.write().await;
        instances.insert(instance.id.clone(), instance);
    }
    
    pub async fn remove(&self, id: &str) {
        let mut instances = self.instances.write().await;
        instances.remove(id);
    }
    
    pub async fn get_all(&self) -> Vec<Instance> {
        let instances = self.instances.read().await;
        instances.values().cloned().collect()
    }
    
    pub async fn get(&self, id: &str) -> Option<Instance> {
        let instances = self.instances.read().await;
        instances.get(id).cloned()
    }
    
    pub async fn test_instance(&self, id: &str) -> Result<InstanceHealth, String> {
        let instance = self.get(id).await.ok_or("Instance not found")?;

        let start = Instant::now();
        let health = self.check_instance_health(&instance).await;
        let latency = start.elapsed().as_millis() as i64;
        let now_str = chrono::Utc::now().to_rfc3339();

        // Update instance health
        let mut instances = self.instances.write().await;
        if let Some(inst) = instances.get_mut(id) {
            inst.health = health.clone();
            inst.latency_ms = Some(latency);
            inst.last_checked = Some(now_str.clone());
        }

        Ok(health)
    }
    
    async fn check_instance_health(&self, instance: &Instance) -> InstanceHealth {
        let (url, params) = health_probe(instance);
        let mut request = self.client.get(&url);
        if !params.is_empty() {
            request = request.query(&params);
        }

        match request.send().await {
            Ok(response) => {
                let success = response.status().is_success();
                let marker = response
                    .text()
                    .await
                    .map(|body| body_marker_ok(instance.instance_type, &body))
                    .unwrap_or(false);
                classify_health(success, marker)
            }
            Err(_) => InstanceHealth::Failed,
        }
    }
    
    pub async fn failover_instance(&self, failed_id: &str) -> Result<(), String> {
        let _instances = self.get_all().await;
        let failed = self.get(failed_id).await.ok_or("Failed instance not found")?;
        
        // Find a healthy instance of the same type
        let healthy = self.instances.read().await
            .values()
            .find(|i| i.id != failed_id && i.instance_type == failed.instance_type && i.health == InstanceHealth::Healthy && i.auto_failover)
            .cloned();
        
        if let Some(healthy) = healthy {
            // Perform failover
            self.failover(failed.id.clone(), healthy.id.clone()).await?;
            Ok(())
        } else {
            Err("No healthy instance available for failover".to_string())
        }
    }
    
    pub async fn failover(&self, from_id: String, to_id: String) -> Result<(), String> {
        // Update instance pool - mark failed as degraded, promote healthy
        let mut instances = self.instances.write().await;
        
        if let Some(failed) = instances.get_mut(&from_id) {
            failed.health = InstanceHealth::Degraded;
            failed.auto_failover = false;
        }
        
        if let Some(healthy) = instances.get_mut(&to_id) {
            healthy.pinned = true;
        }
        
        // Update database
        // TODO: Update DB

        Ok(())
    }

    pub async fn set_auto_failover(&self, enabled: bool) {
        *self.auto_failover.write().await = enabled;
    }
}

impl Clone for InstancePool {
    fn clone(&self) -> Self {
        Self {
            instances: self.instances.clone(),
            client: self.client.clone(),
            db: self.db.clone(),
            app_handle: self.app_handle.clone(),
            auto_failover: self.auto_failover.clone(),
        }
    }
}

/// The health probe request, per instance TYPE: the Invidious path 404s on
/// Piped (its search lives at `/search`), which marked every Piped instance
/// Failed — `order_for_search` then dropped the only seeded instance and
/// every search silently went to yt-dlp (2g; live-checked 2026-10-23: the
/// seeded default answers /search 200 in ~1.5 s while /api/v1/videos/test
/// 404s). Piped now probes the capability the tier exists for: its own
/// search endpoint. Invidious probing is unchanged.
fn health_probe(instance: &Instance) -> (String, Vec<(&'static str, String)>) {
    match instance.instance_type {
        InstanceType::Piped => (
            format!("{}/search", instance.url.trim_end_matches('/')),
            vec![
                ("q", "test".to_string()),
                ("filter", "videos".to_string()),
            ],
        ),
        InstanceType::Invidious => (
            format!("{}/api/v1/videos/test", instance.url.trim_end_matches('/')),
            Vec::new(),
        ),
    }
}

/// Piped's search response is JSON with an `items` array (the committed 1b
/// fixture is a live capture); Invidious keeps the existing branding sniff.
fn body_marker_ok(instance_type: InstanceType, body: &str) -> bool {
    match instance_type {
        InstanceType::Piped => body.contains("\"items\""),
        InstanceType::Invidious => body.contains("Invidious") || body.contains("Piped"),
    }
}

/// Healthy = the probe answered 200 AND the body looks like the instance's
/// own API; a 200 from something else is Degraded; everything else Failed.
fn classify_health(request_success: bool, body_marker: bool) -> InstanceHealth {
    match (request_success, body_marker) {
        (true, true) => InstanceHealth::Healthy,
        (true, false) => InstanceHealth::Degraded,
        (false, _) => InstanceHealth::Failed,
    }
}

/// Search attempts try instances in this order: healthy first (lowest latency
/// wins), then degraded, then unknown; Failed instances are skipped entirely —
/// the health loop just checked them. Pure function so the policy is testable
/// without a Tauri harness.
pub fn order_for_search(instances: &[Instance]) -> Vec<Instance> {    let mut candidates: Vec<Instance> = instances
        .iter()
        .filter(|i| i.health != InstanceHealth::Failed)
        .cloned()
        .collect();
    candidates.sort_by_key(|i| {
        (
            match i.health {
                InstanceHealth::Healthy => 0u8,
                InstanceHealth::Degraded => 1,
                _ => 2,
            },
            i.latency_ms.unwrap_or(i64::MAX),
        )
    });
    candidates
}

#[cfg(test)]
mod search_ordering_tests {
    use super::*;

    fn instance(id: &str, health: InstanceHealth, latency: Option<i64>) -> Instance {
        Instance {
            id: id.to_string(),
            url: format!("https://{}.example", id),
            instance_type: InstanceType::Invidious,
            health,
            latency_ms: latency,
            last_checked: None,
            auto_failover: true,
            supports_sabr: false,
            supports_age_restricted: false,
            region: None,
            country: None,
            pinned: false,
            created_at: "2026-10-20T00:00:00Z".to_string(),
            updated_at: "2026-10-20T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn orders_healthy_before_degraded_and_skips_failed() {
        let instances = vec![
            instance("slow-healthy", InstanceHealth::Healthy, Some(900)),
            instance("failed", InstanceHealth::Failed, Some(1)),
            instance("degraded", InstanceHealth::Degraded, Some(5)),
            instance("fast-healthy", InstanceHealth::Healthy, Some(120)),
            instance("unknown", InstanceHealth::Unknown, None),
        ];
        let ordered = order_for_search(&instances);
        let ids: Vec<&str> = ordered.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["fast-healthy", "slow-healthy", "degraded", "unknown"],
            "healthy first by latency, then degraded, then unknown; failed skipped"
        );
    }
}

#[cfg(test)]
mod health_probe_tests {
    //! 2g: the health probe must speak the instance's OWN API. It probed the
    //! Invidious path for BOTH types; on the Piped default that 404s, the
    //! instance was marked Failed, `order_for_search` dropped it, and every
    //! search silently went to yt-dlp (live-verified 2026-10-23: the seeded
    //! instance answers /search 200 in ~1.5 s while /api/v1/videos/test 404s).

    use super::*;

    fn typed_instance(url: &str, instance_type: InstanceType) -> Instance {
        Instance {
            id: "inst-1".to_string(),
            url: url.to_string(),
            instance_type,
            health: InstanceHealth::Unknown,
            latency_ms: None,
            last_checked: None,
            auto_failover: true,
            supports_sabr: false,
            supports_age_restricted: false,
            region: None,
            country: None,
            pinned: false,
            created_at: "2026-10-23T00:00:00Z".to_string(),
            updated_at: "2026-10-23T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn piped_probes_its_own_search_endpoint() {
        let (url, params) = health_probe(&typed_instance(
            "https://pipedapi.ducks.party/",
            InstanceType::Piped,
        ));
        assert_eq!(url, "https://pipedapi.ducks.party/search");
        assert!(
            params.iter().any(|(k, v)| *k == "filter" && v.as_str() == "videos"),
            "the probe must exercise the capability the tier exists for: search"
        );
    }

    #[test]
    fn invidious_keeps_its_existing_probe_path() {
        let (url, params) = health_probe(&typed_instance(
            "https://invidious.example",
            InstanceType::Invidious,
        ));
        assert_eq!(url, "https://invidious.example/api/v1/videos/test");
        assert!(params.is_empty(), "unchanged Invidious probe: no query params");
    }

    #[test]
    fn classification_follows_the_status_and_marker_table() {
        assert_eq!(classify_health(true, true), InstanceHealth::Healthy);
        assert_eq!(classify_health(true, false), InstanceHealth::Degraded);
        assert_eq!(classify_health(false, true), InstanceHealth::Failed);
        assert_eq!(classify_health(false, false), InstanceHealth::Failed);
    }

    #[test]
    fn piped_marker_matches_the_committed_live_response() {
        // The committed 1b fixture IS a live-captured Piped search response;
        // testing the marker against it keeps the probe honest about the real
        // body shape (captured-then-coded, as 1b did).
        let body = include_str!("../extractor/fixtures/piped_search.json");
        assert!(body_marker_ok(InstanceType::Piped, body));
        assert!(!body_marker_ok(InstanceType::Piped, "<html>not an api</html>"));
        // The Invidious rule is unchanged: its marker stays the branding sniff.
        assert!(!body_marker_ok(InstanceType::Invidious, "{\"items\": []}"));
    }

    // ---- 2g LIVE smoke (network-dependent; #[ignore] keeps CI offline) ----
    // Run explicitly: cargo test --lib -- --ignored

    /// The probe URL for the seeded Piped default must answer 200 and carry
    /// the Piped marker — the OLD probe path (/api/v1/videos/test) 404'd on
    /// this exact host, which is the silent yt-dlp fallback's root cause.
    #[tokio::test]
    #[ignore = "live network: pipedapi.ducks.party"]
    async fn live_piped_probe_url_answers_200() {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .expect("client");
        let instance = typed_instance("https://pipedapi.ducks.party", InstanceType::Piped);
        let (url, params) = health_probe(&instance);
        let resp = client.get(&url).query(&params).send().await.expect("live probe");
        assert!(
            resp.status().is_success(),
            "probe URL {} answered {} — the instance tier would be skipped again",
            url,
            resp.status()
        );
        let body = resp.text().await.expect("body");
        assert!(
            body_marker_ok(InstanceType::Piped, &body),
            "live body must carry the Piped marker"
        );
        println!("LIVE piped probe: {} → 200 with marker", url);
    }
}
