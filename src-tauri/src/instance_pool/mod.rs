//! Invidious/Piped instance pool with health checks and auto-failover

use crate::types::*;
use crate::db::Database;
use tauri::{AppHandle, Manager};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use reqwest::Client;

pub struct InstancePool {
    pub instances: Arc<RwLock<HashMap<String, Instance>>>,
    client: Client,
    db: Arc<Database>,
    app_handle: AppHandle,
    pub auto_failover: Arc<RwLock<bool>>,
    health_check_interval: Duration,
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
            health_check_interval: Duration::from_secs(300), // 5 minutes
        }
    }
    
    pub async fn initialize(&self) -> Result<(), String> {
        // Load instances from database
        let instances = self.db.list_instances().await?;
        let mut instances_map = self.instances.write().await;
        
        for instance in instances {
            instances_map.insert(instance.id.clone(), instance);
        }
        
        // Start health check task
        self.start_health_checks().await;
        
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
    
    async fn start_health_checks(&self) {
        let pool = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(pool.health_check_interval);
            loop {
                interval.tick().await;
                
                let auto_failover = *pool.auto_failover.read().await;
                if !auto_failover {
                    continue;
                }
                
                let instances = pool.get_all().await;
                for instance in instances {
                    if instance.auto_failover && (instance.health == InstanceHealth::Failed || instance.health == InstanceHealth::Degraded) {
                        // Try to failover
                        if let Err(e) = pool.failover_instance(&instance.id).await {
                            tracing::error!("Failover failed for {}: {}", instance.id, e);
                        }
                    }
                }
                
                // Check all instances
                for instance in pool.get_all().await {
                    if let Err(e) = pool.test_instance(&instance.id).await {
                        tracing::warn!("Health check failed for {}: {}", instance.id, e);
                    }
                }
            }
        });
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
            health_check_interval: self.health_check_interval,
        }
    }
}
