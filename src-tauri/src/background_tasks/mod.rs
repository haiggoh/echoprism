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
    let podcast = app_handle.state::<Arc<crate::podcast::PodcastManager>>().inner().clone();

    // Start instance health checks
    start_instance_health_checks(pool);

    // Start smart episode linking
    start_smart_linking(matcher);

    // Start podcast feed fetching
    start_feed_fetching(podcast);

    // Start SponsorBlock sync
    start_sponsorblock_sync();

    // Start cleanup task (includes the hidden-channel retention sweep)
    let db = app_handle.state::<crate::db::Database>().inner().clone();
    start_cleanup(db);
}

fn start_instance_health_checks(
    pool: Arc<InstancePool>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(run_instance_health_checks(pool))
}

/// Dedupe state for failover logging. An instance that STAYS Failed/Degraded
/// would otherwise log "Failover failed … No healthy instance available"
/// every 5-minute cycle forever (live 2026-11-03: repeated ERROR every
/// cycle while the only seeded instance was down). One line per failure
/// episode; a recovery resets the episode. Pure so the policy is testable.
#[derive(Default)]
struct FailoverLog {
    reported: std::collections::HashSet<String>,
}

impl FailoverLog {
    /// true exactly once per continuous unhealthy episode for `id`;
    /// `healthy == true` closes the episode without logging.
    fn should_log(&mut self, id: &str, healthy: bool) -> bool {
        if healthy {
            self.reported.remove(id);
            return false;
        }
        self.reported.insert(id.to_string())
    }
}

async fn run_instance_health_checks(pool: Arc<InstancePool>) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(300)); // 5 minutes
    let mut failover_log = FailoverLog::default();
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

            // Re-read after the probe: the failover decision must use the
            // health THIS tick measured, not the stale pre-test snapshot
            // (the stale clone delayed failover by one 5-min cycle).
            let Some(fresh) = pool.get(&instance.id).await else { continue };
            let unhealthy = fresh.health == InstanceHealth::Failed || fresh.health == InstanceHealth::Degraded;
            let log_now = failover_log.should_log(&fresh.id, !unhealthy);
            if fresh.auto_failover && unhealthy {
                match pool.failover_instance(&fresh.id).await {
                    Ok(()) => tracing::info!("Failed over {} to a healthy instance", fresh.id),
                    Err(e) if log_now => tracing::warn!("Failover failed for {}: {}", fresh.id, e),
                    Err(e) => tracing::debug!("Failover still unavailable for {}: {}", fresh.id, e),
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

fn start_feed_fetching(
    podcast: std::sync::Arc<crate::podcast::PodcastManager>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1800)); // 30 minutes
        loop {
            interval.tick().await;

            // Refresh every feed whose interval has elapsed; failures are
            // logged per feed and never stop the loop.
            match podcast.refresh_due_feeds().await {
                Ok(n) if n > 0 => tracing::info!("Refreshed {} podcast feed(s)", n),
                Ok(_) => {}
                Err(e) => tracing::warn!("Podcast refresh failed: {}", e),
            }
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

fn start_cleanup(db: crate::db::Database) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(86400)); // 24 hours
        // Consume the immediate first tick: the sweep runs on the daily
        // cadence (the Settings "Prune now" button covers on-demand), and the
        // starter-spawn test runs with no tokio reactor — a body that touches
        // the pool on the immediate tick would panic there.
        interval.tick().await;
        loop {
            interval.tick().await;

            // Retention (owner decision 2026-10-31): hidden channels are capped,
            // oldest pruned first; channels with episodes are never dropped.
            match db.prune_hidden_channels(crate::db::queries::MAX_HIDDEN_CHANNELS).await {
                Ok(0) => {}
                Ok(n) => tracing::info!("Retention sweep pruned {n} hidden channel(s) beyond the cap"),
                Err(e) => tracing::warn!("Retention sweep failed: {e}"),
            }

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
        // feed_fetching graduated to a real implementation in 1c (it needs the
        // PodcastManager), so this covers the two remaining stubs; its spawn
        // mechanics are pinned by starter_spawns_outside_any_tokio_runtime.
        let sponsorblock = start_sponsorblock_sync();
        let cleanup = start_cleanup(crate::db::Database::from_pool(
            sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("in-memory pool"),
        ));

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        assert!(
            !sponsorblock.inner().is_finished(),
            "SponsorBlock sync task exited instead of looping"
        );
        assert!(
            !cleanup.inner().is_finished(),
            "cleanup task exited instead of looping"
        );

        sponsorblock.abort();
        cleanup.abort();
    }

    /// Regression for the 2026-10-19 startup panic: tauri's setup closure runs
    /// on the main thread, outside any tokio runtime, and a starter using
    /// `tokio::spawn` directly died with "there is no reactor running" on real
    /// launch (caught by a 15-second smoke run, invisible to `#[tokio::test]`,
    /// which supplies exactly the missing context). Starters must spawn through
    /// `tauri::async_runtime`, whose global runtime works from anywhere.
    /// Live 2026-11-03: with the only instance down, "Failover failed … No
    /// healthy instance available" was logged as ERROR every 5 min forever.
    /// The log must fire once per failure episode and again only after a
    /// recovery — not on every tick.
    #[test]
    fn failover_log_fires_once_per_unhealthy_episode() {
        let mut log = FailoverLog::default();
        assert!(log.should_log("a", false), "first failure of the episode logs");
        assert!(!log.should_log("a", false), "repeat within the same episode does not log");
        assert!(!log.should_log("a", true), "recovery closes the episode silently");
        assert!(log.should_log("a", false), "a NEW episode after recovery logs again");
        assert!(log.should_log("b", false), "another instance is independent");
        assert!(!log.should_log("b", false));
    }

    /// Deliberately a plain `#[test]`: no runtime context is the point.
    #[test]
    fn starter_spawns_outside_any_tokio_runtime() {
        // sponsorblock is the no-db starter: building a Database needs a Tokio
        // context (sqlx 0.7 connect_lazy panics without one), so the
        // no-runtime spawn property is pinned on the db-free starter; the
        // cleanup loop itself is covered by the tokio::test above.
        let handle = start_sponsorblock_sync();
        assert!(
            !handle.inner().is_finished(),
            "cleanup task should be running on the tauri runtime"
        );
        handle.abort();
    }
}