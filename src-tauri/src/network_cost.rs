//! macOS network cost via Network.framework's NWPathMonitor (Task 11).
//!
//! The update handler is an Objective-C block; hand-rolling the block ABI in
//! Rust segfaulted (measured), so the block lives in a tiny Swift helper
//! compiled by build.rs (swift/netmonitor.swift) into `libepnetmonitor.dylib`.
//!
//! Task 3 (2026-11-16-followups-plan, §9 live-test correction): the helper is
//! loaded at RUNTIME with `dlopen` via libloading — never linked. The released
//! v0.1.20 .app linked it by an ABSOLUTE CI path and dyld aborted (exit 134) on
//! every Mac; a local build only worked because its own OUT_DIR existed. With
//! runtime loading, `otool -L <binary> | grep -c netmon` == 0 and the app runs
//! with or without the helper: on load failure one warning is logged, launch
//! never blocks, and `audio_only_on_metered` reports unavailable (the Settings
//! toggle is disabled with a reason).
//!
//! lib.rs re-emits handler updates to the frontend as `network-cost-changed`.
//! macOS only for the monitor itself; the availability flag exists on every
//! platform so the frontend command is uniform.

use std::path::PathBuf;
use std::sync::Mutex;

/// Availability of the net-monitor helper, reported to the frontend
/// (`net_monitor_available`) so Settings can disable the metered-audio
/// toggle with a reason when the helper is missing.
#[derive(Clone, Copy)]
pub struct Availability(pub bool);

#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use std::sync::OnceLock;

    type StartFn = unsafe extern "C" fn(extern "C" fn(bool, bool));
    type StopFn = unsafe extern "C" fn();

    static TX: OnceLock<tokio::sync::mpsc::UnboundedSender<(bool, bool)>> = OnceLock::new();
    static MONITOR: Mutex<Option<Monitor>> = Mutex::new(None);

    /// Keeps the dlopen'd dylib mapped while the monitor runs.
    struct Monitor {
        _lib: libloading::Library,
        #[allow(dead_code)] // read by stop_monitor (teardown), which itself is allow(dead_code)
        stop: Option<StopFn>,
    }

    extern "C" fn ep_netmonitor_cb(expensive: bool, constrained: bool) {
        // OnceLock: the callback fires on a GCD thread; no data race (final-review minor).
        if let Some(tx) = TX.get() {
            let _ = tx.send((expensive, constrained));
        }
    }

    /// Candidate locations for the helper dylib, in order: the bundle's
    /// Resources dir (packaged app), then the dev `gen/` dir (build.rs copies
    /// it there; tauri.conf.json bundles `gen/libepnetmonitor.dylib`).
    pub fn helper_candidates(resource_dir: Option<PathBuf>) -> Vec<PathBuf> {
        let mut v = Vec::new();
        if let Some(d) = resource_dir {
            v.push(d.join("libepnetmonitor.dylib"));
        }
        v.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("gen/libepnetmonitor.dylib"));
        v
    }

    /// dlopen the helper from the first candidate that exists and loads.
    /// Never panics: Err names the last failure so the caller can log one
    /// warning and report the setting unavailable.
    pub fn load_helper(paths: &[PathBuf]) -> Result<libloading::Library, String> {
        let mut last = "no candidate paths".to_string();
        for p in paths {
            if !p.exists() {
                last = format!("{} missing", p.display());
                continue;
            }
            match unsafe { libloading::Library::new(p) } {
                Ok(lib) => return Ok(lib),
                Err(e) => last = format!("{}: {e}", p.display()),
            }
        }
        Err(format!("net-monitor helper unavailable ({last})"))
    }

    /// Start the path monitor from explicit candidate paths. Returns false
    /// (one warning logged) when the helper cannot be loaded — launch never
    /// blocks on this.
    pub fn start_monitor_with_paths(
        tx: tokio::sync::mpsc::UnboundedSender<(bool, bool)>,
        paths: &[PathBuf],
    ) -> bool {
        let lib = match load_helper(paths) {
            Ok(l) => l,
            Err(e) => {
                tracing::warn!("{e} — audio_only_on_metered reports unavailable");
                return false;
            }
        };
        let start_fn: StartFn = match unsafe { lib.get(b"ep_netmonitor_start\0") } {
            Ok(s) => *s,
            Err(e) => {
                tracing::warn!("ep_netmonitor_start missing from helper: {e} — unavailable");
                return false;
            }
        };
        let stop: Option<StopFn> = unsafe { lib.get(b"ep_netmonitor_stop\0") }.ok().map(|s| *s);
        let _ = TX.set(tx);
        // Copy the fn pointers out of the symbols BEFORE moving the Library
        // into the monitor (the symbols borrow it).
        let _ = MONITOR.lock().unwrap().insert(Monitor {
            _lib: lib,
            stop,
        });
        // SAFETY: the symbols come from the freshly dlopen'd helper and the
        // callback signature matches the C ABI the Swift side expects.
        unsafe { start_fn(ep_netmonitor_cb) };
        true
    }

    /// Stop the monitor (tests / teardown).
    #[allow(dead_code)]
    pub fn stop_monitor() {
        if let Some(m) = MONITOR.lock().unwrap().take() {
            if let Some(stop) = m.stop {
                unsafe { stop() };
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// Task 3: a missing helper is an Err (never a panic) and start
        /// reports unavailable — launch never blocks on it.
        #[test]
        fn missing_helper_does_not_panic_and_reports_unavailable() {
            let missing = vec![PathBuf::from("/nonexistent/libepnetmonitor.dylib")];
            let r = load_helper(&missing);
            assert!(r.is_err(), "missing helper must Err, got Ok");
            assert!(r.unwrap_err().contains("unavailable"));
            let (tx, _rx) = tokio::sync::mpsc::unbounded_channel::<(bool, bool)>();
            assert!(!start_monitor_with_paths(tx, &missing), "start must report false when the helper is missing");
        }

        /// The dev gen/ dylib (built by build.rs) loads and exposes both
        /// symbols — this is what makes the packaged-app path work.
        #[test]
        fn gen_dylib_loads_and_exposes_symbols() {
            let paths = helper_candidates(None);
            let gen = paths.last().unwrap();
            if !gen.exists() {
                eprintln!("gen dylib not built in this environment — skipping");
                return;
            }
            let lib = load_helper(&paths).expect("gen dylib must dlopen");
            assert!(unsafe { lib.get::<StartFn>(b"ep_netmonitor_start\0") }.is_ok());
            assert!(unsafe { lib.get::<StopFn>(b"ep_netmonitor_stop\0") }.is_ok());
        }

        /// The ABI proof: the monitor's handler must fire with the CURRENT
        /// path within a few seconds on a networked machine. Skipped (not
        /// failed) when the helper dylib is absent in this environment.
        #[tokio::test]
        async fn monitor_handler_fires_with_current_path() {
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<(bool, bool)>();
            if !start_monitor_with_paths(tx, &helper_candidates(None)) {
                eprintln!("net-monitor helper unavailable here — skipping the ABI proof");
                return;
            }
            let got = tokio::time::timeout(std::time::Duration::from_secs(8), rx.recv())
                .await
                .expect("NWPathMonitor handler must fire within 8 s")
                .expect("channel alive");
            let _ = got;
        }
    }
}

#[cfg(target_os = "macos")]
pub use imp::*;

#[cfg(not(target_os = "macos"))]
pub fn helper_candidates(_resource_dir: Option<PathBuf>) -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(not(target_os = "macos"))]
pub fn load_helper(_paths: &[PathBuf]) -> Result<(), String> {
    Err("net-monitor helper is macOS-only".to_string())
}

/// Start the monitor (macOS) — see the macOS impl. Non-macOS: always false.
#[cfg(not(target_os = "macos"))]
pub fn start_monitor_with_paths(
    _tx: tokio::sync::mpsc::UnboundedSender<(bool, bool)>,
    _paths: &[PathBuf],
) -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub fn stop_monitor() {}
