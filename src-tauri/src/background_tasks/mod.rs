//! Background tasks

use crate::instance_pool::InstancePool;
use crate::types::{InstanceHealth};
use tauri::Manager;
use std::sync::Arc;

/// Starts every background loop. Sync by design: each starter spawns its task
/// onto the tauri async runtime immediately and returns a `JoinHandle`. (They
/// used to be `async fn`s whose `tokio::spawn` sat inside the body; calling
/// them without `.await` dropped the future and no task ever ran.)
pub fn start_all(app_handle: tauri::AppHandle) {
    let pool = app_handle.state::<Arc<crate::instance_pool::InstancePool>>().inner().clone();
    let matcher = app_handle.state::<Arc<crate::matcher::EpisodeMatcher>>().inner().clone();

    // Start instance health checks
    start_instance_health_checks(pool);

    // Start smart episode linking
    start_smart_linking(matcher);

    // Start podcast feed fetching
    start_feed_fetching();

    // Start SponsorBlock sync
    start_sponsorblock_sync();

    // Start cleanup task
    start_cleanup();
}

fn start_instance_health_checks(
    pool: Arc<InstancePool>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(run_instance_health_checks(pool))
}

async fn run_instance_health_checks(pool: Arc<InstancePool>) {
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

fn start_smart_linking(
    matcher: std::sync::Arc<crate::matcher::EpisodeMatcher>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600)); // 1 hour
        loop {
            interval.tick().await;

            // Only run on WiFi (would need platform-specific check)
            // For now, always run
            if let Err(e) = matcher.match_all().await {
                tracing::error!("Smart linking failed: {}", e);
            }
        }
    })
}

fn start_feed_fetching() -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1800)); // 30 minutes
        loop {
            interval.tick().await;

            // Fetch all active podcast feeds
            // This would query the database for active feeds and fetch each
            // For now, just log
            tracing::info!("Background feed fetch triggered");
        }
    })
}

fn start_sponsorblock_sync() -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(86400)); // 24 hours
        loop {
            interval.tick().await;

            // Sync SponsorBlock cache
            // This would fetch latest segments for recently watched videos
            tracing::info!("SponsorBlock sync triggered");
        }
    })
}

fn start_cleanup() -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression net for the dropped-future bug fixed on 2026-10-19: the stub
    /// starters were `async fn`s whose `tokio::spawn` sat inside the body, so
    /// `start_all` calling them without `.await` dropped the future and none of
    /// the background loops ever started (five `unused_must_use` warnings). A
    /// starter must be a plain function that spawns and hands back a live
    /// `JoinHandle` — a shape that makes the forgotten-`.await` mistake
    /// unrepresentable.
    #[tokio::test]
    async fn stub_starters_spawn_live_looping_tasks() {
        let feed = start_feed_fetching();
        let sponsorblock = start_sponsorblock_sync();
        let cleanup = start_cleanup();

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        assert!(
            !feed.inner().is_finished(),
            "feed-fetching task exited instead of looping"
        );
        assert!(
            !sponsorblock.inner().is_finished(),
            "SponsorBlock sync task exited instead of looping"
        );
        assert!(
            !cleanup.inner().is_finished(),
            "cleanup task exited instead of looping"
        );

        feed.abort();
        sponsorblock.abort();
        cleanup.abort();
    }

    /// Regression for the 2026-10-19 startup panic: tauri's setup closure runs
    /// on the main thread, outside any tokio runtime, and a starter using
    /// `tokio::spawn` directly died with "there is no reactor running" on real
    /// launch (caught by a 15-second smoke run, invisible to `#[tokio::test]`,
    /// which supplies exactly the missing context). Starters must spawn through
    /// `tauri::async_runtime`, whose global runtime works from anywhere.
    /// Deliberately a plain `#[test]`: no runtime context is the point.
    #[test]
    fn starter_spawns_outside_any_tokio_runtime() {
        let handle = start_cleanup();
        assert!(
            !handle.inner().is_finished(),
            "cleanup task should be running on the tauri runtime"
        );
        handle.abort();
    }
}