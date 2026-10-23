//! 4f opt-in crash reporting (roadmap decision 3, Phase C).
//!
//! Design: NOTHING leaves this machine automatically. Panics and frontend
//! errors are captured into a bounded local ring file; the user can file a
//! GitHub issue with the STRIPPED report through their own browser action —
//! no embedded upload token (any token shipped in a public app is
//! extractable), no silent uploads, no raw reports for the owner to read:
//! a scheduled Action dedupes and labels the `crash:` issues that arrive.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const RING_CAP: usize = 10;
const RING_FILE: &str = "crash-reports.jsonl";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CrashRecord {
    /// "panic" | "js-error" | "js-rejection"
    pub kind: String,
    /// The dedup key the GitHub Action groups issues by.
    pub signature: String,
    /// Sanitized — no home paths, no usernames.
    pub message: String,
    pub app_version: String,
    /// RFC 3339.
    pub at: String,
}

/// FNV-1a — a stable in-file hasher; the signature only needs to GROUP
/// identical crashes, not resist anything.
fn fnv1a(data: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in data.bytes() {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Strip personal data: absolute paths under `home` become `~`; any OTHER
/// absolute path collapses to its basename (file:line survives for dedup).
/// `~`-relative and workspace-relative refs are already anonymous and pass
/// through untouched — which is exactly what grouping needs.
pub fn sanitize(text: &str, home: &str) -> String {
    let s = if home.is_empty() {
        text.to_string()
    } else {
        text.replace(home, "~")
    };
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let at_boundary = i == 0
            || chars[i - 1].is_whitespace()
            || matches!(chars[i - 1], '(' | '"' | '\'' | '[');
        if c == '/' && at_boundary {
            // An ABSOLUTE path starts here: consume it, emit only its
            // final segment (basename plus any :line:col suffix).
            let mut j = i;
            let mut last_slash = i;
            while j < chars.len()
                && !chars[j].is_whitespace()
                && !matches!(chars[j], ')' | ',' | '"' | '\'' | ']')
            {
                if chars[j] == '/' {
                    last_slash = j;
                }
                j += 1;
            }
            for &k in &chars[last_slash + 1..j] {
                out.push(k);
            }
            i = j;
        } else {
            out.push(c);
            i += 1;
        }
    }
    out
}

/// The dedup key: kind + the first line of the sanitized message (the
/// panic location line follows, so identical crashes at different lines of
/// the same file still group when the message matches).
pub fn signature(kind: &str, sanitized_message: &str) -> String {
    let first_line = sanitized_message.lines().next().unwrap_or("").to_string();
    format!("{:x}", fnv1a(&format!("{kind}:{first_line}")))
}

fn ring_path(dir: &Path) -> PathBuf {
    dir.join(RING_FILE)
}

/// Append one record, keeping only the newest RING_CAP (bounded by design —
/// a crash loop must not grow an unbounded file).
pub fn write_crash_record(dir: &Path, record: &CrashRecord) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut records = read_crash_records(dir);
    records.push(record.clone());
    let start = records.len().saturating_sub(RING_CAP);
    let kept = &records[start..];
    let mut buf = String::new();
    for r in kept {
        buf.push_str(&serde_json::to_string(r).map_err(|e| e.to_string())?);
        buf.push('\n');
    }
    std::fs::write(ring_path(dir), buf).map_err(|e| e.to_string())
}

/// Records, oldest first; unreadable lines are skipped, not fatal.
pub fn read_crash_records(dir: &Path) -> Vec<CrashRecord> {
    let Ok(text) = std::fs::read_to_string(ring_path(dir)) else {
        return Vec::new();
    };
    text.lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

pub fn clear_crash_records(dir: &Path) -> Result<(), String> {
    std::fs::remove_file(ring_path(dir)).or_else(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            Ok(())
        } else {
            Err(e.to_string())
        }
    })
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))
}

/// Install the panic capture: the PREVIOUS hook still runs (Tauri/wry
/// prints its own diagnostics), we only record.
pub fn install_panic_hook(app: AppHandle) {
    let app = std::sync::Mutex::new(app);
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        {
            let Ok(app) = app.lock() else { return };
            let Ok(dir) = app_data_dir(&app) else { return };
            let home = std::env::var("HOME").unwrap_or_default();
            let raw = format!("{info}");
            let message = sanitize(&raw, &home);
            let record = CrashRecord {
                kind: "panic".into(),
                signature: signature("panic", &message),
                message,
                app_version: env!("CARGO_PKG_VERSION").into(),
                at: chrono::Utc::now().to_rfc3339(),
            };
            let _ = write_crash_record(&dir, &record);
        }
        default(info);
    }));
}

#[cfg(test)]
mod crash_tests {
    use super::*;

    fn record(kind: &str, message: &str) -> CrashRecord {
        CrashRecord {
            kind: kind.into(),
            signature: signature(kind, message),
            message: message.into(),
            app_version: "0.1.0".into(),
            at: "2026-10-23T00:00:00Z".into(),
        }
    }

    fn temp_dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("echoprism-crash-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).expect("temp dir");
        d
    }

    /// Home paths collapse to ~; OTHER absolute paths collapse to their
    /// basename; line numbers survive for dedup; ~-relative and
    /// workspace-relative refs pass through.
    #[test]
    fn sanitize_strips_home_and_basenames_paths() {
        let raw = "panicked at /Users/alice/dev/echoprism/src-tauri/src/main.rs:42:10:\nboom";
        let out = sanitize(raw, "/Users/alice");
        assert!(out.contains("~/dev/echoprism"), "home collapses to ~: {out}");
        assert!(out.contains("src-tauri/src/main.rs:42:10"), "relative path survives: {out}");
        assert!(!out.contains("alice"), "no username survives: {out}");

        // An absolute path OUTSIDE home still loses its directories.
        let out = sanitize("at /private/var/folders/abc/tmp/panic.rs:7:1", "/Users/alice");
        assert_eq!(out, "at panic.rs:7:1", "non-home absolute paths collapse: {out}");

        // Quoted relative locations (Rust's common form) pass through.
        let out = sanitize("panicked at 'src/lib.rs:3:9'", "");
        assert!(out.contains("'src/lib.rs:3:9'"), "relative quoted paths untouched: {out}");
    }

    #[test]
    fn signature_is_stable_and_discriminating() {
        let a = signature("panic", "index out of bounds\nat main.rs:1:1");
        let a2 = signature("panic", "index out of bounds\nat main.rs:2:2");
        let b = signature("panic", "division by zero\nat main.rs:1:1");
        assert_eq!(a, a2, "same message groups even across lines");
        assert_ne!(a, b, "different messages must not group");
    }

    #[test]
    fn ring_keeps_only_the_newest_records() {
        let dir = temp_dir();
        for i in 0..(RING_CAP + 2) {
            write_crash_record(&dir, &record("panic", &format!("crash {i}")))
                .expect("write");
        }
        let kept = read_crash_records(&dir);
        assert_eq!(kept.len(), RING_CAP);
        assert_eq!(kept[0].message, "crash 2", "oldest beyond the cap dropped");
        assert_eq!(kept.last().unwrap().message, "crash 11", "newest kept");
        clear_crash_records(&dir).expect("clear");
        assert!(read_crash_records(&dir).is_empty());
        clear_crash_records(&dir).expect("clear on missing file is fine");
    }

    #[test]
    fn round_trip_preserves_records() {
        let dir = temp_dir();
        let r = record("js-error", "TypeError: x is undefined\nat app.tsx:3:5");
        write_crash_record(&dir, &r).expect("write");
        let back = read_crash_records(&dir);
        assert_eq!(back.len(), 1);
        assert_eq!(back[0], r);
    }
}
