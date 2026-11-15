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
    /// Per-instance consecutive RESOLVE-attempt failure streak (round 13).
    /// Degraded only reorders; at FAIL_STREAK_LIMIT the instance goes Failed
    /// and is excluded from candidates — the 5-min background probe is the
    /// only way back to Healthy (test_instance clears the streak on success).
    pub resolve_fail_streaks: Arc<RwLock<HashMap<String, u32>>>,
    /// Task 2: STREAM capability health per instance, probed via the /streams
    /// endpoint (search health says nothing about playback — a Piped
    /// instance can answer /search 200 while /streams 500s). Resolve-attempt
    /// outcomes feed THIS map plus stream_fail_streaks, never the search
    /// health of `instances`.
    pub stream_health: Arc<RwLock<HashMap<String, InstanceHealth>>>,
    pub stream_fail_streaks: Arc<RwLock<HashMap<String, u32>>>,
}

/// After how many consecutive resolve failures an instance is marked Failed.
pub const FAIL_STREAK_LIMIT: u32 = 3;

/// The video id the STREAM health probe fetches. NOT dQw4w9WgXcQ — that id is
/// served from an LBRY mirror (200) even when YouTube bot-blocks the
/// instance; jNQXAC9IVRw answers 500 when blocked (measured 2026-11-15).
pub const STREAM_PROBE_VIDEO_ID: &str = "jNQXAC9IVRw";

/// Pure streak bookkeeping, unit-tested without a Tauri harness: increments the
/// streak and flips health to Failed at the limit; a success resets it.
pub fn apply_resolve_outcome(
    streaks: &mut HashMap<String, u32>,
    health: &mut InstanceHealth,
    id: &str,
    failed: bool,
) {
    if failed {
        let n = streaks.entry(id.to_string()).or_insert(0);
        *n += 1;
        if *n >= FAIL_STREAK_LIMIT && *health != InstanceHealth::Failed {
            *health = InstanceHealth::Failed;
        }
    } else {
        streaks.remove(id);
        if *health == InstanceHealth::Failed {
            *health = InstanceHealth::Unknown;
        }
    }
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
            resolve_fail_streaks: Arc::new(RwLock::new(HashMap::new())),
            stream_health: Arc::new(RwLock::new(HashMap::new())),
            stream_fail_streaks: Arc::new(RwLock::new(HashMap::new())),
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

    /// Mark an instance Degraded after a failed resolve attempt (round 9
    /// option 0). Degraded — not Failed — deliberately: order_for_search
    /// still TRIES degraded instances (sorted last), so the next resolve can
    /// prove the instance healthy again; Failed would exclude it outright.
    pub async fn mark_degraded(&self, id: &str) {
        let mut instances = self.instances.write().await;
        if let Some(instance) = instances.get_mut(id) {
            if instance.health == InstanceHealth::Healthy || instance.health == InstanceHealth::Unknown {
                instance.health = InstanceHealth::Degraded;
            }
        }
    }

    /// Round 13 refinement: note a resolve-attempt outcome for one instance —
    /// failures build a streak that flips the instance to Failed at
    /// FAIL_STREAK_LIMIT (excluded from candidates); a success (or a passing
    /// probe) resets it. Pure logic lives in apply_resolve_outcome (unit-tested).
    pub async fn note_resolve_outcome(&self, id: &str, failed: bool) {
        let mut streaks = self.resolve_fail_streaks.write().await;
        let mut instances = self.instances.write().await;
        if let Some(inst) = instances.get_mut(id) {
            apply_resolve_outcome(&mut streaks, &mut inst.health, id, failed);
        }
    }

    /// Task 2: a STREAM resolve outcome feeds the stream-capability maps
    /// only — the instance's search health is untouched (a Piped instance
    /// can be search-healthy while bot-blocked for /streams).
    pub async fn note_stream_resolve_outcome(&self, id: &str, failed: bool) {
        let mut streaks = self.stream_fail_streaks.write().await;
        let mut health = self.stream_health.write().await;
        let entry = health.entry(id.to_string()).or_insert(InstanceHealth::Unknown);
        apply_resolve_outcome(&mut streaks, entry, id, failed);
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
            inst.health = health;
            inst.latency_ms = Some(latency);
            inst.last_checked = Some(now_str.clone());
        }
        // A passing probe also clears any resolve-failure streak (revival).
        if health == InstanceHealth::Healthy {
            self.resolve_fail_streaks.write().await.remove(id);
        }

        // Task 2: probe the STREAM capability independently — the 5-min loop
        // calls test_instance, so both capabilities are probed each cycle.
        let stream_health = self.check_stream_health(&instance).await;
        self.stream_health
            .write()
            .await
            .insert(instance.id.clone(), stream_health);
        if stream_health == InstanceHealth::Healthy {
            self.stream_fail_streaks.write().await.remove(id);
        }

        Ok(health)
    }

    /// The stream-capability probe for one instance: 2xx → Healthy, anything
    /// else (500 bot-block, 404, timeout) → Failed. No body marker: the
    /// bot-block signal IS the 500, and a 200 body is playable regardless.
    async fn check_stream_health(&self, instance: &Instance) -> InstanceHealth {
        probe_stream_health(&self.client, instance).await
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
            resolve_fail_streaks: self.resolve_fail_streaks.clone(),
            stream_health: self.stream_health.clone(),
            stream_fail_streaks: self.stream_fail_streaks.clone(),
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

/// Task 2: the /streams probe URL per instance TYPE — Piped serves streams at
/// `/streams/{id}`; Invidious at `/api/v1/videos/{id}`. The id is
/// STREAM_PROBE_VIDEO_ID (never the LBRY-mirror false positive).
pub fn stream_health_probe(instance: &Instance) -> String {
    match instance.instance_type {
        InstanceType::Piped => format!(
            "{}/streams/{STREAM_PROBE_VIDEO_ID}",
            instance.url.trim_end_matches('/')
        ),
        InstanceType::Invidious => format!(
            "{}/api/v1/videos/{STREAM_PROBE_VIDEO_ID}",
            instance.url.trim_end_matches('/')
        ),
    }
}

/// One stream-capability probe against the instance's real endpoint.
/// Free function (client injected) so tests can point it at a fake upstream.
async fn probe_stream_health(client: &Client, instance: &Instance) -> InstanceHealth {
    let url = stream_health_probe(instance);
    match client.get(&url).send().await {
        Ok(response) if response.status().is_success() => InstanceHealth::Healthy,
        Ok(response) => {
            tracing::debug!(
                "stream probe {} -> {} (not 2xx → Failed)",
                url,
                response.status()
            );
            InstanceHealth::Failed
        }
        Err(e) => {
            tracing::debug!("stream probe {url} -> {e} (→ Failed)");
            InstanceHealth::Failed
        }
    }
}

/// Task 2: stream attempts use the SAME ordering as search, but exclude any
/// instance whose STREAM health is Failed (absent from the map = never probed
/// = still eligible). Pure function, testable without a Tauri harness.
pub fn order_for_stream(
    instances: &[Instance],
    stream_health: &HashMap<String, InstanceHealth>,
) -> Vec<Instance> {
    let mut candidates: Vec<Instance> = instances
        .iter()
        .filter(|i| i.health != InstanceHealth::Failed)
        .filter(|i| stream_health.get(&i.id) != Some(&InstanceHealth::Failed))
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

    #[test]
    fn resolve_failure_streak_flips_to_failed_at_the_limit_and_success_resets() {
        use super::{apply_resolve_outcome, FAIL_STREAK_LIMIT};
        let mut streaks = HashMap::new();
        let mut health = InstanceHealth::Healthy;
        let id = "inst-1";

        for i in 1..FAIL_STREAK_LIMIT {
            apply_resolve_outcome(&mut streaks, &mut health, id, true);
            assert_eq!(health, InstanceHealth::Healthy, "streak {i} below the limit keeps the instance");
            assert_eq!(streaks[id], i);
        }
        apply_resolve_outcome(&mut streaks, &mut health, id, true);
        assert_eq!(health, InstanceHealth::Failed, "at the limit the instance is excluded from candidates");
        assert_eq!(streaks[id], FAIL_STREAK_LIMIT);

        // A success (a serving instance, or a passing probe) resets the streak.
        apply_resolve_outcome(&mut streaks, &mut health, id, false);
        assert!(!streaks.contains_key(id), "streak cleared on success");
        assert_eq!(health, InstanceHealth::Unknown, "Failed lifts to Unknown on success, re-admitted by the probe");

        // A different instance's streak is independent.
        apply_resolve_outcome(&mut streaks, &mut health, "inst-2", true);
        assert_eq!(streaks.get("inst-1"), None);
        assert_eq!(streaks["inst-2"], 1);
    }
}

#[cfg(test)]
mod stream_health_tests {
    //! Task 2: stream eligibility is judged by the STREAM endpoint, not the
    //! search endpoint. dQw4w9WgXcQ is a false-positive id (LBRY mirror, 200);
    //! the probe id is jNQXAC9IVRw (500 when YouTube bot-blocks the instance).
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    /// A one-shot-per-connection HTTP/1.1 fake: /search → 200 {"items":[]},
    /// /streams/* → 200 or 500 depending on the shared flag, else 404.
    fn spawn_fake_upstream(stream_ok: Arc<AtomicBool>) -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut s) = stream else { break };
                let mut buf = [0u8; 4096];
                let _ = std::io::Read::read(&mut s, &mut buf);
                let req = String::from_utf8_lossy(&buf);
                let path = req
                    .lines()
                    .next()
                    .unwrap_or("")
                    .split_whitespace()
                    .nth(1)
                    .unwrap_or("");
                let (status, body) = if path.starts_with("/streams/") {
                    if stream_ok.load(Ordering::SeqCst) {
                        ("200 OK", "{\"videoStreams\": [], \"audioStreams\": []}".to_string())
                    } else {
                        ("500 Internal Server Error", String::new())
                    }
                } else if path.starts_with("/search") {
                    ("200 OK", "{\"items\": []}".to_string())
                } else {
                    ("404 Not Found", String::new())
                };
                let resp = format!(
                    "HTTP/1.1 {status}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = std::io::Write::write_all(&mut s, resp.as_bytes());
            }
        });
        format!("http://{addr}")
    }

    fn typed(url: &str, instance_type: InstanceType) -> Instance {
        Instance {
            id: "inst-1".to_string(),
            url: url.to_string(),
            instance_type,
            health: InstanceHealth::Healthy, // the SEARCH probe passed
            latency_ms: Some(100),
            last_checked: None,
            auto_failover: true,
            supports_sabr: false,
            supports_age_restricted: false,
            region: None,
            country: None,
            pinned: false,
            created_at: "2026-11-15T00:00:00Z".to_string(),
            updated_at: "2026-11-15T00:00:00Z".to_string(),
        }
    }

    fn test_client() -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap()
    }

    #[tokio::test]
    async fn search_ok_streams_500_is_excluded_from_stream_candidates() {
        let ok = Arc::new(AtomicBool::new(false)); // /streams → 500 (bot-blocked)
        let url = spawn_fake_upstream(ok);
        let client = test_client();
        let inst = typed(&url, InstanceType::Piped);
        // One stream probe against the fake upstream.
        let sh = probe_stream_health(&client, &inst).await;
        assert_eq!(sh, InstanceHealth::Failed, "Piped /streams 500 must classify Failed");
        let mut stream_health = HashMap::new();
        stream_health.insert(inst.id.clone(), sh);
        let all = vec![inst.clone()];
        assert!(
            order_for_search(&all).iter().any(|i| i.id == inst.id),
            "search health (Healthy) still admits the instance"
        );
        assert!(
            order_for_stream(&all, &stream_health).iter().all(|i| i.id != inst.id),
            "stream health Failed must exclude it from stream candidates"
        );
    }

    #[tokio::test]
    async fn stream_probe_success_readmits() {
        let ok = Arc::new(AtomicBool::new(false));
        let url = spawn_fake_upstream(ok.clone());
        let client = test_client();
        let inst = typed(&url, InstanceType::Piped);
        let failed = probe_stream_health(&client, &inst).await;
        assert_eq!(failed, InstanceHealth::Failed);
        let mut map = HashMap::new();
        map.insert(inst.id.clone(), failed);
        assert!(order_for_stream(&[inst.clone()], &map).is_empty());

        ok.store(true, Ordering::SeqCst); // /streams now 200
        let healthy = probe_stream_health(&client, &inst).await;
        assert_eq!(healthy, InstanceHealth::Healthy);
        map.insert(inst.id.clone(), healthy);
        assert_eq!(
            order_for_stream(&[inst.clone()], &map).len(),
            1,
            "a passing stream probe re-admits the instance"
        );
    }

    #[test]
    fn resolve_streak_flips_stream_health_not_search_health() {
        let mut stream_streaks = HashMap::new();
        let mut stream_health_map: HashMap<String, InstanceHealth> = HashMap::new();
        let mut inst = typed("https://x.example", InstanceType::Piped);
        inst.health = InstanceHealth::Healthy; // the SEARCH side
        let id = inst.id.clone();
        stream_health_map.insert(id.clone(), InstanceHealth::Healthy);
        for _ in 0..FAIL_STREAK_LIMIT {
            apply_resolve_outcome(&mut stream_streaks, stream_health_map.get_mut(&id).unwrap(), &id, true);
        }
        assert_eq!(
            stream_health_map[&id],
            InstanceHealth::Failed,
            "stream streak at the limit flips STREAM health to Failed"
        );
        assert_eq!(
            inst.health,
            InstanceHealth::Healthy,
            "resolve failures must NOT touch the search-side health"
        );
        apply_resolve_outcome(&mut stream_streaks, stream_health_map.get_mut(&id).unwrap(), &id, false);
        assert_eq!(
            stream_health_map[&id],
            InstanceHealth::Unknown,
            "a success lifts stream health (the probe re-admits)"
        );
    }

    #[test]
    fn stream_probe_url_matches_instance_type() {
        let piped = typed("https://piped.example/", InstanceType::Piped);
        assert_eq!(
            stream_health_probe(&piped),
            format!("https://piped.example/streams/{STREAM_PROBE_VIDEO_ID}")
        );
        let inv = typed("https://inv.example", InstanceType::Invidious);
        assert_eq!(
            stream_health_probe(&inv),
            format!("https://inv.example/api/v1/videos/{STREAM_PROBE_VIDEO_ID}")
        );
    }
}
