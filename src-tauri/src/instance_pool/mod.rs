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
        let test_url = format!("{}/api/v1/videos/test", instance.url.trim_end_matches('/'));
        
        match self.client.get(&test_url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    // Check if it's actually an Invidious/Piped instance
                    if let Ok(text) = response.text().await {
                        if text.contains("Invidious") || text.contains("Piped") {
                            return InstanceHealth::Healthy;
                        }
                    }
                    InstanceHealth::Degraded
                } else {
                    InstanceHealth::Failed
                }
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
    
    pub async fn get_best_instance(&self, instance_type: InstanceType) -> Option<Instance> {
        let instances = self.instances.read().await;
        instances.values()
            .filter(|i| i.instance_type == instance_type && i.health == InstanceHealth::Healthy)
            .min_by_key(|i| i.latency_ms.unwrap_or(i64::MAX))
            .cloned()
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

/// Search attempts try instances in this order: healthy first (lowest latency
/// wins), then degraded, then unknown; Failed instances are skipped entirely —
/// the health loop just checked them. Pure function so the policy is testable
/// without a Tauri harness.
pub fn order_for_search(instances: &[Instance]) -> Vec<Instance> {
    let mut candidates: Vec<Instance> = instances
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
