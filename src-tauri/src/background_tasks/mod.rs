//! Background tasks

use crate::db::Database;
use crate::instance_pool::InstancePool;
use crate::matcher::EpisodeMatcher;
use crate::sponsorblock::SponsorBlockManager;
use crate::podcast::PodcastManager;
use crate::types::{InstanceHealth};
use tauri::{AppHandle, Manager};
use std::sync::Arc;
use tokio::time::{interval, Duration};
use chrono::Utc;
use tracing::{info, warn, error};

pub async fn start_all(app_handle: tauri::AppHandle) {
    let pool = app_handle.state::<crate::instance_pool::InstancePool>().inner().clone();
    let db = app_handle.state::<Database>().inner().clone();
    let matcher = app_handle.state::<crate::matcher::EpisodeMatcher>().inner().clone();
    let sponsorblock = app_handle.state::<crate::sponsorblock::SponsorBlockManager>().inner().clone();
    let podcast = app_handle.state::<crate::podcast::PodcastManager>().inner().clone();

    // Start instance health checks
    start_instance_health_checks(pool);

    // Start smart episode linking
    start_smart_linking(matcher);

    // Start podcast feed fetching
    start_feed_fetching(podcast);

    // Start SponsorBlock sync
    start_sponsorblock_sync(sponsorblock);

    // Start cleanup task
    start_cleanup(db);
}

async fn start_instance_health_checks(pool: InstancePool) {
    let pool_clone = pool.clone();
    let _ = tokio::spawn(run_instance_health_checks(pool_clone));
}

async fn run_instance_health_checks(pool: InstancePool) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(300)); // 5 minutes
    loop {
        interval.tick().await;

        let auto_failover = *pool.auto_failover.read().await;
        if !auto_failover {
            continue;
        }

        let instances = pool.get_all().await;
        for instance in instances {
            // Test all instances periodically
            if let Err(e) = pool.test_instance(&instance.id).await {
                tracing::warn!("Health check failed for {}: {}", instance.id, e);
            }

            // Check for failover needed
            if instance.auto_failover && (instance.health == InstanceHealth::Failed || instance.health == InstanceHealth::Degraded) {
                if let Err(e) = pool.failover_instance(&instance.id).await {
                    tracing::error!("Failover failed for {}: {}", instance.id, e);
                }
            }
        }
    }
}

async fn start_smart_linking(matcher: std::sync::Arc<crate::matcher::EpisodeMatcher>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600)); // 1 hour
        loop {
            interval.tick().await;

            // Only run on WiFi (would need platform-specific check)
            // For now, always run
            if let Err(e) = matcher.match_all().await {
                tracing::error!("Smart linking failed: {}", e);
            }
        }
    });
}

async fn start_feed_fetching(podcast: std::sync::Arc<crate::podcast::PodcastManager>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1800)); // 30 minutes
        loop {
            interval.tick().await;

            // Fetch all active podcast feeds
            // This would query the database for active feeds and fetch each
            // For now, just log
            tracing::info!("Background feed fetch triggered");
        }
    });
}

async fn start_sponsorblock_sync(sponsorblock: std::sync::Arc<crate::sponsorblock::SponsorBlockManager>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(86400)); // 24 hours
        loop {
            interval.tick().await;

            // Sync SponsorBlock cache
            // This would fetch latest segments for recently watched videos
            tracing::info!("SponsorBlock sync triggered");
        }
    });
}

async fn start_cleanup(db: std::sync::Arc<Database>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(86400)); // 24 hours
        loop {
            interval.tick().await;

            // Clean old data
            // - Old downloads (completed > 30 days)
            // - Old history ( > 90 days)
            // - Old instance health logs ( > 30 days)
            // - Expired SponsorBlock cache
            // - Old episode links (unconfirmed, old)

            // For now, just log
            tracing::info!("Cleanup task triggered");
        }
    });
}