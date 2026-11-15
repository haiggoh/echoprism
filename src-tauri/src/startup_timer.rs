//! Start-up timing (plan: browser-fast playback start, Task 1).
//!
//! Per play, the frontend reports click → URL ready → first frame as a
//! `StartupRecord`; the backend keeps the last 50 in memory and logs one
//! `info!` line per play so every later change in the resolve path is
//! proven by numbers, not impressions.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Mutex;
use tauri::State;

/// Stage wall-times of one resolve, stamped inside the extractor.
/// `cache_hit` marks a play served from the stream cache (Task 4) — the
/// frontend derives the record's `path` ("pre-resolved" vs "cold") from it.
#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct ResolveTimings {
    pub instances_ms: u64,
    pub ytdlp_ms: u64,
    pub gate_ms: u64,
    pub probe_ms: u64,
    pub cache_hit: bool,
}

/// One measured play, reported by the frontend when the media element first
/// renders a frame for the resolved src.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct StartupRecord {
    pub episode_id: String,
    /// "youtube-video" | "youtube-audio" | "podcast"
    pub source: String,
    /// "pre-resolved" | "cold"
    pub path: String,
    pub click_to_url_ms: u64,
    pub url_to_first_frame_ms: u64,
    pub total_ms: u64,
    pub timings: Option<ResolveTimings>,
}

/// The last N startup records, evicting the oldest. Sync (`std` mutex) so
/// both commands and tests stay runtime-free.
pub struct StartupLog {
    inner: Mutex<VecDeque<StartupRecord>>,
    capacity: usize,
}

impl Default for StartupLog {
    fn default() -> Self {
        Self::new(50)
    }
}

impl StartupLog {
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Mutex::new(VecDeque::with_capacity(capacity)),
            capacity,
        }
    }

    pub fn push(&self, r: StartupRecord) {
        let mut q = self.inner.lock().unwrap();
        if q.len() >= self.capacity {
            q.pop_front();
        }
        q.push_back(r);
    }

    pub fn recent(&self) -> Vec<StartupRecord> {
        self.inner.lock().unwrap().iter().cloned().collect()
    }
}

/// The one `info!` line per play — greppable as `startup total_ms=`, so the
/// total comes directly after the tag.
fn log_startup_line(r: &StartupRecord) {
    tracing::info!(
        "startup total_ms={} episode_id={} source={} path={} click_to_url_ms={} url_to_first_frame_ms={} timings={:?}",
        r.total_ms,
        r.episode_id,
        r.source,
        r.path,
        r.click_to_url_ms,
        r.url_to_first_frame_ms,
        r.timings
    );
}

#[tauri::command]
pub async fn report_startup(
    record: StartupRecord,
    log: State<'_, StartupLog>,
) -> Result<(), String> {
    log.push(record.clone());
    log_startup_line(&record);
    Ok(())
}

#[tauri::command]
pub async fn recent_startups(log: State<'_, StartupLog>) -> Result<Vec<StartupRecord>, String> {
    Ok(log.recent())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(id: &str) -> StartupRecord {
        StartupRecord {
            episode_id: id.to_string(),
            source: "youtube-video".to_string(),
            path: "cold".to_string(),
            click_to_url_ms: 1,
            url_to_first_frame_ms: 1,
            total_ms: 2,
            timings: None,
        }
    }

    #[test]
    fn startup_log_keeps_last_50() {
        let log = StartupLog::new(50);
        for i in 0..60 {
            log.push(record(&format!("ep-{i}")));
        }
        let recent = log.recent();
        assert_eq!(recent.len(), 50, "capacity 50 must evict the oldest");
        assert_eq!(recent[0].episode_id, "ep-10", "the 11th pushed survives at the head");
        assert_eq!(recent[49].episode_id, "ep-59");
    }

    #[test]
    fn report_startup_logs_one_info_line() {
        // Capture the `info!` output with a fmt subscriber writing into a
        // shared Vec — no extra crate, tracing-subscriber is already a dep.
        let buf: std::sync::Arc<std::sync::Mutex<Vec<u8>>> = Default::default();
        struct VecWriter(std::sync::Arc<std::sync::Mutex<Vec<u8>>>);
        impl std::io::Write for VecWriter {
            fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
                self.0.lock().unwrap().extend_from_slice(b);
                Ok(b.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        let writer_buf = buf.clone();
        let subscriber = tracing_subscriber::fmt()
            .with_max_level(tracing::Level::INFO)
            .with_writer(move || VecWriter(writer_buf.clone()))
            .finish();
        let rec = record("ep-1");
        tracing::subscriber::with_default(subscriber, || log_startup_line(&rec));
        let captured = String::from_utf8(buf.lock().unwrap().clone()).unwrap();
        // Value-bound assertions, not just the pattern: a positional arg
        // shift still contains "startup total_ms=" and would pass a
        // substring check (caught by the milestone validator 2026-11-15).
        assert!(
            captured.contains("startup total_ms=2 "),
            "total_ms must carry the record's total (2): {captured}"
        );
        assert!(
            captured.contains("episode_id=ep-1"),
            "episode_id must carry the id: {captured}"
        );
    }
}
