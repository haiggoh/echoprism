//! Instance management commands

use crate::db::Database;
use crate::instance_pool::InstancePool;
use crate::types::*;
use serde::{Deserialize, Serialize};
use tauri::{command, State};

#[command]
pub async fn list_instances(db: State<'_, Database>, pool: State<'_, InstancePool>) -> std::result::Result<Vec<Instance>, String> {
    let instances = db.list_instances().await?;
    let pool_instances = pool.get_all().await;

    // Merge DB instances with pool health status
    Ok(instances.into_iter().map(|mut inst| {
        if let Some(pool_inst) = pool_instances.iter().find(|p| p.id == inst.id) {
            inst.health = pool_inst.health.clone();
            inst.latency_ms = pool_inst.latency_ms;
        }
        inst
    }).collect())
}

#[command]
pub async fn add_instance(db: State<'_, Database>, pool: State<'_, InstancePool>, url: String, instance_type: InstanceType) -> std::result::Result<Instance, String> {
    let instance = Instance {
        id: uuid::Uuid::new_v4().to_string(),
        url,
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
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    db.insert_instance(&instance).await?;
    pool.add(instance.clone()).await;

    Ok(instance)
}

#[command]
pub async fn remove_instance(db: State<'_, Database>, pool: State<'_, InstancePool>, id: String) -> std::result::Result<(), String> {
    db.delete_instance(&id).await?;
    pool.remove(&id).await;
    Ok(())
}

#[command]
pub async fn test_instance(pool: State<'_,  InstancePool>, id: String) -> std::result::Result<InstanceHealth, String> {
    let health = pool.test_instance(&id).await?;
    Ok(health)
}

#[command]
pub async fn failover_instance(pool: State<'_,  InstancePool>, from_id: String, to_id: String) -> std::result::Result<(), String> {
    pool.failover(&from_id, &to_id).await
}

#[command]
pub async fn instance_health(pool: State<'_,  InstancePool>) -> std::result::Result<Vec<InstanceHealthResponse>, String> {
    let instances = pool.get_all().await;
    Ok(instances.into_iter().map(|i| InstanceHealthResponse {
        id: i.id,
        url: i.url,
        instance_type: i.instance_type,
        health: i.health,
        latency_ms: i.latency_ms,
        last_checked: i.last_checked,
        supports_sabr: i.supports_sabr,
        supports_age_restricted: i.supports_age_restricted,
        region: i.region,
    }).collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceHealthResponse {
    pub id: String,
    pub url: String,
    pub instance_type: InstanceType,
    pub health: InstanceHealth,
    pub latency_ms: Option<u64>,
    pub last_checked: Option<chrono::DateTime<chrono::Utc>>,
    pub supports_sabr: bool,
    pub supports_age_restricted: bool,
    pub region: Option<String>,
}

#[command]
pub async fn set_auto_failover(pool: State<'_,  InstancePool>, enabled: bool) -> std::result::Result<(), String> {
    pool.set_auto_failover(enabled).await;
    Ok(())
}

#[command]
pub async fn health_dashboard(pool: State<'_,  InstancePool>) -> std::result::Result<Vec<InstanceHealthResponse>, String> {
    instance_health(pool).await
}

#[command]
pub async fn auto_failover_toggle(pool: State<'_,  InstancePool>, enabled: bool) -> std::result::Result<(), String> {
    set_auto_failover(pool, enabled).await
}