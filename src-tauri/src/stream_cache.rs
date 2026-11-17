//! Stream cache + prefetch (plan: browser-fast playback start, Task 4).
//!
//! Pre-resolved, gate-passed streams keyed by (episode_id, mode), committed
//! only after the `available_at` gate answered 200/206 — so a cache hit is
//! always immediately playable. In-flight dedupe: one shared future per key,
//! so a click during a pending pre-resolve awaits it instead of starting a
//! second yt-dlp. Errors are never cached. Prefetch is capped at
//! `max_concurrent_prefetch` concurrent resolves.

use crate::commands::episodes::StreamInfo;
use crate::types::Episode;
use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{OnceCell, Semaphore};

#[derive(Clone, Hash, Eq, PartialEq, Debug)]
pub struct CacheKey {
    pub episode_id: String,
    pub mode: StreamMode,
}

#[derive(Clone, Copy, Hash, Eq, PartialEq, Debug)]
pub enum StreamMode {
    Audio,
    Video,
}

impl StreamMode {
    /// The `format` argument of stream/prefetch: "audio" → Audio, else Video.
    pub fn from_format(format: Option<&str>) -> Self {
        if format.is_some_and(|f| f.eq_ignore_ascii_case("audio")) {
            StreamMode::Audio
        } else {
            StreamMode::Video
        }
    }
}

#[derive(Clone)]
pub struct CachedStream {
    pub primary: StreamInfo,
    /// Task 7 fills the podcast original-URL fallback; Task 9 the
    /// format-18 progressive fallback. None until then.
    pub fallback: Option<StreamInfo>,
    pub expires_at: Instant,
}

/// Cache entry lifetime: a googlevideo `expire=<unix>` query param minus a
/// 10-minute safety margin; URLs without the param (proxy tokens, plain
/// enclosures) get a conservative 30 minutes; a past expire is expired now.
pub fn expiry_from_url(url: &str, now: Instant) -> Instant {
    let expire = url.split(['?', '&']).find_map(|p| p.strip_prefix("expire=")).and_then(|v| v.parse::<u64>().ok());
    match expire {
        Some(unix) => {
            let now_unix = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let margin = 600u64;
            if unix > now_unix + margin {
                now + Duration::from_secs(unix - now_unix - margin)
            } else {
                now // already expired
            }
        }
        None => now + Duration::from_secs(1800),
    }
}

/// Backend choke point for prefetch: hover must NEVER trigger a podcast
/// request (it would inflate listening stats) — only queue-origin prefetch
/// may touch a podcast enclosure.
pub fn prefetch_gate(episode: &Episode, origin: &str) -> bool {
    let is_youtube = episode.video_id.as_deref().map(|v| !v.trim().is_empty()).unwrap_or(false);
    if !is_youtube && origin == "hover" {
        return false;
    }
    true
}

type SharedCell = Arc<OnceCell<Result<CachedStream, String>>>;

pub struct StreamCache {
    cells: Arc<Mutex<HashMap<CacheKey, SharedCell>>>,
    semaphore: Arc<Semaphore>,
}

impl StreamCache {
    pub fn new(max_concurrent_prefetch: usize) -> Self {
        Self {
            cells: Arc::new(Mutex::new(HashMap::new())),
            semaphore: Arc::new(Semaphore::new(max_concurrent_prefetch)),
        }
    }

    #[cfg(test)]
    pub(crate) fn insert_test_entry(&self, key: CacheKey, c: CachedStream) {
        let cell: SharedCell = Arc::new(OnceCell::new());
        let _ = cell.set(Ok(c));
        self.cells.lock().unwrap().insert(key, cell);
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.cells.lock().unwrap().len()
    }

    #[cfg(test)]
    pub(crate) fn is_settled(&self, key: &CacheKey) -> bool {
        self.cells
            .lock()
            .unwrap()
            .get(key)
            .and_then(|c| c.get())
            .is_some()
    }

    /// Resolve through the cache: return a live entry, join the in-flight
    /// one, or run `resolve` once (shared by all concurrent callers).
    /// Errors are removed, never cached. The returned clone's
    /// `timings.cache_hit` is true when the entry was NOT created by this call
    /// (i.e. served from cache or from a joined in-flight pre-resolve).
    pub async fn get_or_resolve<F, Fut>(&self, key: CacheKey, resolve: F) -> Result<CachedStream, String>
    where
        F: Fn() -> Fut + Send,
        Fut: Future<Output = Result<CachedStream, String>> + Send,
    {
        // Phase 1 (sync): live hit → return; expired/errored → drop; else
        // create-or-join the shared cell.
        let (cell, created) = {
            let mut map = self.cells.lock().unwrap();
            if let Some(c) = map.get(&key) {
                match c.get() {
                    Some(Ok(cached)) if cached.expires_at > Instant::now() => {
                        let mut out = cached.clone();
                        if let Some(t) = out.primary.timings.as_mut() {
                            t.cache_hit = true;
                        }
                        return Ok(out);
                    }
                    // Completed but expired (or errored): drop so a fresh
                    // resolve starts. None (in-flight) must NOT be removed —
                    // the caller joins the shared future below.
                    Some(Ok(_)) | Some(Err(_)) => {
                        map.remove(&key);
                    }
                    None => {}
                }
            }
            match map.entry(key.clone()) {
                std::collections::hash_map::Entry::Occupied(o) => (o.get().clone(), false),
                std::collections::hash_map::Entry::Vacant(v) => {
                    let cell: SharedCell = Arc::new(OnceCell::new());
                    v.insert(cell.clone());
                    (cell, true)
                }
            }
        };
        // Phase 2 (async): one shared future per key.
        let t_join = std::time::Instant::now();
        let result = cell.get_or_init(|| resolve()).await;
        let joined_wait = t_join.elapsed();
        match result {
            Ok(c) => {
                let mut out = c.clone();
                if let Some(t) = out.primary.timings.as_mut() {
                    t.cache_hit = !created; // joined a shared resolve → pre-resolved path
                    // Task 2c (§10 D): a click that JOINED the in-flight resolve
                    // reports path="joined" with the wait, distinct from a
                    // completed cache hit ("pre-resolved", no wait).
                    if !created {
                        t.joined_ms = Some(joined_wait.as_millis() as u64);
                    }
                }
                Ok(out)
            }
            Err(e) => {
                // Errors are NOT cached: drop the cell so the next caller re-resolves.
                let mut map = self.cells.lock().unwrap();
                if map.get(&key).is_some_and(|v| Arc::ptr_eq(v, &cell)) {
                    map.remove(&key);
                }
                Err(e.clone())
            }
        }
    }

    /// Best-effort pre-resolve: acquires a semaphore permit WITHOUT blocking
    /// the caller (when the cap is saturated the prefetch is skipped) and
    /// resolves in the background. Shares the in-flight dedupe with
    /// get_or_resolve.
    pub async fn prefetch<F, Fut>(&self, key: CacheKey, resolve: F)
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<CachedStream, String>> + Send + 'static,
    {
        let permit = match self.semaphore.clone().try_acquire_owned() {
            Ok(p) => p,
            Err(_) => return, // cap saturated — enqueueing is a no-op
        };
        let cells = self.cells.clone();
        let cache = StreamCache {
            cells,
            semaphore: self.semaphore.clone(),
        };
        tauri::async_runtime::spawn(async move {
            let _permit = permit; // held for the whole background resolve
            let _ = cache.get_or_resolve(key, resolve).await; // prefetch failures are dropped
        });
    }

    /// Drop every entry for an episode (media error → re-resolve path).
    pub fn invalidate(&self, episode_id: &str) {
        self.cells
            .lock()
            .unwrap()
            .retain(|k, _| k.episode_id != episode_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Episode;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    fn key(id: &str) -> CacheKey {
        CacheKey {
            episode_id: id.to_string(),
            mode: StreamMode::Video,
        }
    }

    fn info(url: &str) -> crate::commands::episodes::StreamInfo {
        crate::commands::episodes::StreamInfo {
            url: url.to_string(),
            headers: None,
            format: "mp4".to_string(),
            // Some(default) so tests can observe the cache's stamp mutations
            // (cache_hit / joined_ms) on the returned entry.
            timings: Some(Default::default()),
            fallback_url: None,
        }
    }

    fn cached(url: &str, expires_at: Instant) -> CachedStream {
        CachedStream {
            primary: info(url),
            fallback: None,
            expires_at,
        }
    }

    type BoxFut = std::pin::Pin<Box<dyn std::future::Future<Output = Result<CachedStream, String>> + Send>>;

    fn resolver(
        runs: Arc<AtomicUsize>,
        gate: Arc<tokio::sync::Notify>,
    ) -> impl Fn() -> BoxFut + Send + Sync {
        move || {
            let runs = runs.clone();
            let gate = gate.clone();
            Box::pin(async move {
                runs.fetch_add(1, Ordering::SeqCst);
                gate.notified().await;
                Ok(cached("http://x/v.mp4", Instant::now() + Duration::from_secs(600)))
            })
        }
    }

    #[tokio::test]
    async fn click_during_prefetch_awaits_single_resolve() {
        let cache = Arc::new(StreamCache::new(2));
        let runs = Arc::new(AtomicUsize::new(0));
        let gate = Arc::new(tokio::sync::Notify::new());
        cache
            .prefetch(key("ep"), resolver(runs.clone(), gate.clone()))
            .await;
        tokio::time::sleep(Duration::from_millis(50)).await; // let the prefetch task start
        assert_eq!(runs.load(Ordering::SeqCst), 1, "prefetch started one resolve");

        let cache2 = cache.clone();
        let runs2 = runs.clone();
        let gate2 = gate.clone();
        let click = tokio::spawn(async move {
            cache2
                .get_or_resolve(key("ep"), resolver(runs2, gate2))
                .await
        });
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(
            runs.load(Ordering::SeqCst),
            1,
            "the click joined the in-flight prefetch — no second resolve"
        );
        gate.notify_one();
        let joined = click.await.unwrap().expect("resolve succeeds");
        assert_eq!(joined.primary.url, "http://x/v.mp4");
        assert!(
            joined.primary.timings.is_none() || joined.primary.timings.as_ref().unwrap().cache_hit,
            "a play served from the shared in-flight resolve is marked pre-resolved"
        );
        // Task 2c (§10 D): the JOINED play carries the wait as joined_ms.
        let t = joined.primary.timings.as_ref().expect("timings present");
        assert!(t.cache_hit, "joined → cache_hit");
        assert!(t.joined_ms.is_some(), "joined in-flight → joined_ms set: {t:?}");
        // a later cache HIT has no join wait (resolver never runs on a hit):
        let again = cache
            .get_or_resolve(key("ep"), || {
                Box::pin(async {
                    Ok(cached("http://x/never-called", Instant::now() + Duration::from_secs(600)))
                }) as BoxFut
            })
            .await
            .expect("cached");
        let t2 = again.primary.timings.as_ref().unwrap();
        assert!(t2.cache_hit && t2.joined_ms.is_none(), "completed cache hit → no joined_ms: {t2:?}");
    }

    #[tokio::test]
    async fn errors_are_not_cached() {
        let cache = StreamCache::new(2);
        let runs = Arc::new(AtomicUsize::new(0));
        let mk = || {
            let runs = runs.clone();
            move || {
                let runs = runs.clone();
                Box::pin(async move {
                    let n = runs.fetch_add(1, Ordering::SeqCst) + 1;
                    if n == 1 {
                        Err("boom".to_string())
                    } else {
                        Ok(cached("http://x/ok", Instant::now() + Duration::from_secs(600)))
                    }
                }) as BoxFut
            }
        };
        let r = cache.get_or_resolve(key("e"), mk()).await;
        assert!(r.is_err(), "first resolve fails");
        let r2 = cache.get_or_resolve(key("e"), mk()).await;
        assert!(r2.is_ok(), "errors are not cached — the second call re-resolves");
        assert_eq!(runs.load(Ordering::SeqCst), 2);
        let runs3 = runs.clone();
        let r3 = cache
            .get_or_resolve(key("e"), move || {
                let runs3 = runs3.clone();
                Box::pin(async move {
                    runs3.fetch_add(1, Ordering::SeqCst);
                    Ok(cached("http://x/never", Instant::now() + Duration::from_secs(600)))
                }) as BoxFut
            })
            .await;
        assert!(r3.is_ok());
        assert_eq!(runs.load(Ordering::SeqCst), 2, "the success IS cached — resolver not re-run");
    }

    #[tokio::test]
    async fn expired_entry_re_resolves() {
        let cache = StreamCache::new(2);
        cache.insert_test_entry(
            key("e"),
            cached("http://x/stale", Instant::now() - Duration::from_secs(1)),
        );
        let runs = Arc::new(AtomicUsize::new(0));
        let r = cache
            .get_or_resolve(key("e"), {
                let runs = runs.clone();
                move || {
                    let runs = runs.clone();
                    Box::pin(async move {
                        runs.fetch_add(1, Ordering::SeqCst);
                        Ok(cached("http://x/fresh", Instant::now() + Duration::from_secs(600)))
                    }) as BoxFut
                }
            })
            .await
            .expect("expired entry must re-resolve");
        assert_eq!(r.primary.url, "http://x/fresh");
        assert_eq!(runs.load(Ordering::SeqCst), 1, "resolver ran once for the expired entry");
    }

    #[tokio::test]
    async fn prefetch_concurrency_is_capped_at_two() {
        let cache = StreamCache::new(2);
        let in_flight = Arc::new(AtomicUsize::new(0));
        let max_seen = Arc::new(AtomicUsize::new(0));
        let release = Arc::new(tokio::sync::Notify::new());
        for i in 0..5 {
            let in_flight = in_flight.clone();
            let max_seen = max_seen.clone();
            let release = release.clone();
            cache
                .prefetch(key(&format!("ep-{i}")), move || {
                    let in_flight = in_flight.clone();
                    let max_seen = max_seen.clone();
                    let release = release.clone();
                    Box::pin(async move {
                        let cur = in_flight.fetch_add(1, Ordering::SeqCst) + 1;
                        max_seen.fetch_max(cur, Ordering::SeqCst);
                        release.notified().await;
                        in_flight.fetch_sub(1, Ordering::SeqCst);
                        Ok(cached("http://x/v.mp4", Instant::now() + Duration::from_secs(600)))
                    }) as BoxFut
                })
                .await;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(
            max_seen.load(Ordering::SeqCst),
            2,
            "5 prefetches with cap 2 → at most 2 resolvers in flight"
        );
        release.notify_waiters();
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(cache.len(), 2, "the 3 over-cap prefetches were skipped, 2 cached");
    }

    #[test]
    fn expiry_from_url_parses_expire_param() {
        let now = Instant::now();
        let now_unix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        // googlevideo expire=<unix>: expiry = expire - 10 min margin
        let url = format!("https://rr1---sn-x.googlevideo.com/videoplayback?foo=1&expire={}", now_unix + 3600);
        let exp = expiry_from_url(&url, now);
        let delta = (exp - now).as_secs();
        assert!(
            (2999..=3001).contains(&delta),
            "expire=now+3600 → expiry ≈ now+3000 s (10-min margin), got {delta}"
        );
        // no expire param → now + 30 min
        let exp2 = expiry_from_url("https://cdn.example.com/audio.mp3?foo=bar", now);
        let d2 = (exp2 - now).as_secs();
        assert!((1799..=1801).contains(&d2), "missing expire → now+1800 s, got {d2}");
        // past expire → already expired
        let url3 = format!("https://rr1---sn-x.googlevideo.com/videoplayback?expire={}", now_unix - 10);
        assert!(expiry_from_url(&url3, now) <= now, "past expire → expired immediately");
    }

    fn episode_with(video_id: Option<&str>) -> Episode {
        Episode {
            id: "ep-1".to_string(),
            channel_id: "ch-1".to_string(),
            external_id: "ext-1".to_string(),
            title: "t".to_string(),
            description: None,
            thumbnail_url: None,
            duration_seconds: None,
            published_at: None,
            url: None,
            video_id: video_id.map(|s| s.to_string()),
            podcast_guid: None,
            episode_number: None,
            season_number: None,
            audio_url: Some("https://cdn.example.com/ep.mp3".to_string()),
            video_url: None,
            formats: None,
            chapters: None,
            sponsors: None,
            transcript_url: None,
            is_downloaded: false,
            download_quality: None,
            progress_seconds: 0.0,
            created_at: "2026-11-15T00:00:00Z".to_string(),
            updated_at: "2026-11-15T00:00:00Z".to_string(),
            smart_link_id: None,
            linked_episode_id: None,
            channel: None,
        }
    }

    #[test]
    fn hover_prefetch_of_podcast_makes_no_request() {
        // The backend choke point: hover on a podcast episode (no video_id)
        // must return before any network request is built.
        let podcast = episode_with(None);
        assert!(!prefetch_gate(&podcast, "hover"), "hover + podcast → no request");
        assert!(prefetch_gate(&podcast, "queue"), "queue may pre-follow podcast enclosures");
        let yt = episode_with(Some("abc123"));
        assert!(prefetch_gate(&yt, "hover"), "hover on a YouTube card prefetches");
        assert!(prefetch_gate(&yt, "queue"));
    }
}
