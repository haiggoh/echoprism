//! Which IP family can reach YouTube from this network — learned once,
//! remembered across launches, and kept current in the background.
//!
//! Measured 2026-10-27 on the owner's home network: IPv6 to youtube.com and
//! googlevideo.com never connects. Browsers and curl race both families
//! (Happy Eyeballs) and land on IPv4 in ~0.5 s; yt-dlp does not race, so it
//! hung and every video "stuck on load". The rule from the owner: a timeout
//! must never gate playback. So the verdict is read, not discovered, at play
//! time: a persisted `Broken` starts yt-dlp on IPv4 immediately, a launch
//! probe refreshes the verdict without blocking anything, and a flip to
//! `Broken` cancels an in-flight IPv6 attempt and restarts it on IPv4.

use std::future::Future;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::Output;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::sync::watch;

/// Hard ceiling per yt-dlp attempt. A safety net for a wedged binary only —
/// a broken network never waits on it (see module docs).
pub const YT_DLP_CEILING: Duration = Duration::from_secs(60);
/// How long the IPv6 probe waits for a TCP connect.
pub const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
/// Failure-triggered probes run at most this often.
const PROBE_DEBOUNCE: Duration = Duration::from_secs(60);
const PROBE_HOST: &str = "www.youtube.com";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ipv6Verdict {
    Unknown,
    Works,
    Broken,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct NetState {
    ipv6_youtube: String,
    measured_at: String,
}

pub struct NetPath {
    tx: watch::Sender<Ipv6Verdict>,
    state_path: Option<PathBuf>,
    last_probe: Mutex<Option<Instant>>,
}

impl NetPath {
    /// Seed from `state_path` (a missing or unparseable file is `Unknown`).
    pub fn load(state_path: PathBuf) -> Self {
        let initial = std::fs::read_to_string(&state_path)
            .ok()
            .and_then(|s| serde_json::from_str::<NetState>(&s).ok())
            .map(|st| match st.ipv6_youtube.as_str() {
                "works" => Ipv6Verdict::Works,
                "broken" => Ipv6Verdict::Broken,
                _ => Ipv6Verdict::Unknown,
            })
            .unwrap_or(Ipv6Verdict::Unknown);
        let (tx, _rx) = watch::channel(initial);
        Self { tx, state_path: Some(state_path), last_probe: Mutex::new(None) }
    }

    /// No persistence — for tests and for a missing app data dir.
    pub fn in_memory() -> Self {
        let (tx, _rx) = watch::channel(Ipv6Verdict::Unknown);
        Self { tx, state_path: None, last_probe: Mutex::new(None) }
    }

    pub fn current(&self) -> Ipv6Verdict {
        *self.tx.borrow()
    }

    pub fn subscribe(&self) -> watch::Receiver<Ipv6Verdict> {
        self.tx.subscribe()
    }

    /// Publish a verdict to every in-flight attempt, and persist a definite one.
    pub fn set(&self, v: Ipv6Verdict) {
        self.tx.send_replace(v);
        let (Some(path), Some(word)) = (&self.state_path, match v {
            Ipv6Verdict::Works => Some("works"),
            Ipv6Verdict::Broken => Some("broken"),
            Ipv6Verdict::Unknown => None,
        }) else {
            return;
        };
        let state = NetState { ipv6_youtube: word.into(), measured_at: chrono::Utc::now().to_rfc3339() };
        let Ok(json) = serde_json::to_string(&state) else { return };
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, json).and_then(|_| std::fs::rename(&tmp, path)).is_err() {
            tracing::warn!("could not persist the IPv6 verdict to {}", path.display());
        }
    }

    /// Re-measure in the background. Never awaited by playback.
    ///
    /// Spawned through Tauri's own runtime, NOT `tokio::spawn`: this runs from
    /// `.setup()`, which on macOS executes on the main thread via tao's
    /// `did_finish_launching`, outside any Tokio runtime — a bare `tokio::spawn`
    /// aborted the app at launch with "there is no reactor running" (regression
    /// 2026-10-28, pinned by spawn_probe_outside_a_runtime_does_not_panic).
    /// Same call the background-task loops use (background_tasks/mod.rs).
    pub fn spawn_probe(self: &Arc<Self>) {
        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            let v = probe_ipv6(PROBE_HOST, PROBE_TIMEOUT).await;
            tracing::info!("IPv6 to {} probe: {:?}", PROBE_HOST, v);
            me.set(v);
        });
    }

    /// `spawn_probe`, at most once per debounce window — for failure paths.
    pub fn request_probe(self: &Arc<Self>) {
        {
            let mut last = self.last_probe.lock().unwrap_or_else(|e| e.into_inner());
            if last.is_some_and(|t| t.elapsed() < PROBE_DEBOUNCE) {
                return;
            }
            *last = Some(Instant::now());
        }
        self.spawn_probe();
    }
}

pub fn force_ipv4(v: Ipv6Verdict) -> bool {
    v == Ipv6Verdict::Broken
}

/// The network arguments every yt-dlp invocation starts with.
pub fn yt_dlp_net_args(force_ipv4: bool) -> Vec<String> {
    let mut args = vec!["--socket-timeout".to_string(), "15".to_string()];
    if force_ipv4 {
        args.push("--force-ipv4".into());
    }
    args
}

/// Resolve `host`'s IPv6 addresses and try a TCP connect to them. `timeout`
/// bounds the WHOLE probe, DNS included.
pub async fn probe_ipv6(host: &str, timeout: Duration) -> Ipv6Verdict {
    let deadline = tokio::time::Instant::now() + timeout;
    let addrs: Vec<SocketAddr> = match tokio::time::timeout_at(deadline, tokio::net::lookup_host((host, 443))).await {
        Ok(Ok(it)) => it.filter(SocketAddr::is_ipv6).collect(),
        _ => Vec::new(),
    };
    probe_addrs(&addrs, deadline.saturating_duration_since(tokio::time::Instant::now())).await
}

/// `Works` if any address accepts a connection within `timeout`; no
/// addresses at all also counts as `Broken` (nothing to reach over IPv6).
/// All addresses are tried at once under ONE deadline — tried in sequence,
/// youtube.com's several AAAA records turned a 3 s probe into 24 s.
pub async fn probe_addrs(addrs: &[SocketAddr], timeout: Duration) -> Ipv6Verdict {
    let mut attempts = tokio::task::JoinSet::new();
    for &addr in addrs {
        attempts.spawn(async move { tokio::net::TcpStream::connect(addr).await.is_ok() });
    }
    let any_connected = async {
        while let Some(done) = attempts.join_next().await {
            if matches!(done, Ok(true)) {
                return true;
            }
        }
        false
    };
    match tokio::time::timeout(timeout, any_connected).await {
        Ok(true) => Ipv6Verdict::Works,
        _ => Ipv6Verdict::Broken,
    }
}

async fn until_broken(rx: &mut watch::Receiver<Ipv6Verdict>) {
    loop {
        if *rx.borrow_and_update() == Ipv6Verdict::Broken {
            return;
        }
        if rx.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}

fn ok_output(r: Result<Result<Output, String>, tokio::time::error::Elapsed>) -> Result<Output, String> {
    match r {
        Ok(Ok(o)) if o.status.success() => Ok(o),
        Ok(Ok(o)) => Err(String::from_utf8_lossy(&o.stderr).trim().to_string()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(format!("no answer within {}s", YT_DLP_CEILING.as_secs())),
    }
}

/// Run one yt-dlp job under the current verdict. `run(force_ipv4)` performs
/// the invocation (its child must be `kill_on_drop`, so a cancelled attempt
/// dies with its future); `on_v6_failure` is called when the default path
/// fails, so the caller can re-probe.
pub async fn run_with_netpath<F, Fut>(
    netpath: &NetPath,
    run: F,
    on_v6_failure: impl FnOnce(),
) -> Result<Output, String>
where
    F: Fn(bool) -> Fut,
    Fut: Future<Output = Result<Output, String>>,
{
    if force_ipv4(netpath.current()) {
        return ok_output(tokio::time::timeout(YT_DLP_CEILING, run(true)).await)
            .map_err(|e| format!("yt-dlp failed over IPv4: {e}"));
    }
    let mut rx = netpath.subscribe();
    let first = tokio::select! {
        r = tokio::time::timeout(YT_DLP_CEILING, run(false)) => Some(ok_output(r)),
        _ = until_broken(&mut rx) => None,
    };
    let v6_err = match first {
        Some(Ok(o)) => return Ok(o),
        Some(Err(e)) => {
            on_v6_failure();
            e
        }
        None => "cancelled: IPv6 found broken mid-attempt".to_string(),
    };
    ok_output(tokio::time::timeout(YT_DLP_CEILING, run(true)).await)
        .map_err(|e4| format!("yt-dlp could not resolve over IPv6 ({v6_err}) or IPv4 ({e4})"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::process::ExitStatusExt;
    use std::process::{ExitStatus, Output};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    fn out(code: i32) -> Output {
        Output { status: ExitStatus::from_raw(code << 8), stdout: b"https://ok\n".to_vec(), stderr: Vec::new() }
    }

    fn netpath_with(v: Ipv6Verdict) -> Arc<NetPath> {
        let np = Arc::new(NetPath::in_memory());
        np.set(v);
        np
    }

    /// Regression, live-test 2026-10-28: `echoprism` aborted at launch with
    /// "there is no reactor running, must be called from the context of a Tokio
    /// 1.x runtime", traced to the probe spawn in NetPath::spawn_probe.
    /// `.setup()` runs on the main thread — macOS reaches it through tao's
    /// `did_finish_launching` — where there is no Tokio runtime, so a bare
    /// `tokio::spawn` panics and takes the whole app down.
    ///
    /// Deliberately a PLAIN `#[test]`, NOT `#[tokio::test]`: the defect is
    /// precisely that no runtime is present, and a tokio::test would supply one
    /// and pass against the broken code.
    #[test]
    fn spawn_probe_outside_a_runtime_does_not_panic() {
        use std::panic::{self, AssertUnwindSafe};

        // The panic is ASSERTED here, not a real failure, so keep the default
        // hook from printing a backtrace into the test log.
        let prev_hook = panic::take_hook();
        panic::set_hook(Box::new(|_| {}));
        let result = panic::catch_unwind(AssertUnwindSafe(|| {
            Arc::new(NetPath::in_memory()).spawn_probe();
        }));
        panic::set_hook(prev_hook);

        let panic_msg = result.as_ref().err().and_then(|p| {
            p.downcast_ref::<&str>()
                .map(|s| (*s).to_string())
                .or_else(|| p.downcast_ref::<String>().cloned())
        });
        assert!(
            result.is_ok(),
            "spawn_probe must spawn through Tauri's own runtime (tauri::async_runtime::spawn), \
             not tokio::spawn — .setup() runs outside a Tokio runtime. Panicked with: {panic_msg:?}"
        );
    }

    #[test]
    fn net_args_add_force_ipv4_only_when_broken() {
        assert!(!yt_dlp_net_args(force_ipv4(Ipv6Verdict::Unknown)).contains(&"--force-ipv4".to_string()));
        assert!(!yt_dlp_net_args(force_ipv4(Ipv6Verdict::Works)).contains(&"--force-ipv4".to_string()));
        let broken = yt_dlp_net_args(force_ipv4(Ipv6Verdict::Broken));
        assert!(broken.contains(&"--force-ipv4".to_string()));
        // Every invocation carries a socket timeout, on either path.
        assert!(broken.windows(2).any(|w| w == ["--socket-timeout", "15"]));
    }

    #[tokio::test]
    async fn persisted_broken_starts_on_ipv4() {
        let np = netpath_with(Ipv6Verdict::Broken);
        let calls = Arc::new(Mutex::new(Vec::<bool>::new()));
        let c = calls.clone();
        let r = run_with_netpath(&np, move |v4| {
            c.lock().unwrap().push(v4);
            async { Ok(out(0)) }
        }, || {})
        .await;
        assert!(r.is_ok());
        // Exactly one invocation, already on IPv4: no wait on a dead path.
        assert_eq!(*calls.lock().unwrap(), vec![true]);
    }

    #[tokio::test]
    async fn healthy_network_runs_once_without_ipv4() {
        let np = netpath_with(Ipv6Verdict::Works);
        let calls = Arc::new(Mutex::new(Vec::<bool>::new()));
        let c = calls.clone();
        run_with_netpath(&np, move |v4| {
            c.lock().unwrap().push(v4);
            async { Ok(out(0)) }
        }, || {})
        .await
        .unwrap();
        assert_eq!(*calls.lock().unwrap(), vec![false]);
    }

    #[tokio::test]
    async fn unknown_then_probe_flips_broken_restarts_inflight() {
        let np = netpath_with(Ipv6Verdict::Unknown);
        let calls = Arc::new(Mutex::new(Vec::<bool>::new()));
        let c = calls.clone();
        let flipper = np.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            flipper.set(Ipv6Verdict::Broken);
        });
        let started = Instant::now();
        let r = run_with_netpath(&np, move |v4| {
            c.lock().unwrap().push(v4);
            async move {
                if !v4 {
                    // The dead IPv6 path: hangs (far past the test's bound).
                    tokio::time::sleep(Duration::from_secs(600)).await;
                }
                Ok(out(0))
            }
        }, || {})
        .await;
        assert!(r.is_ok());
        assert_eq!(*calls.lock().unwrap(), vec![false, true]);
        // Restarted on the flip, not after a timeout.
        assert!(started.elapsed() < Duration::from_secs(2), "took {:?}", started.elapsed());
    }

    #[tokio::test]
    async fn failure_without_v4_retries_once_with_v4_and_requests_probe() {
        let np = netpath_with(Ipv6Verdict::Unknown);
        let calls = Arc::new(Mutex::new(Vec::<bool>::new()));
        let probes = Arc::new(AtomicUsize::new(0));
        let (c, p) = (calls.clone(), probes.clone());
        let r = run_with_netpath(&np, move |v4| {
            c.lock().unwrap().push(v4);
            async move { Ok(out(if v4 { 0 } else { 1 })) }
        }, move || {
            p.fetch_add(1, Ordering::SeqCst);
        })
        .await;
        assert!(r.is_ok());
        assert_eq!(*calls.lock().unwrap(), vec![false, true]);
        assert_eq!(probes.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn both_paths_failing_is_an_error_naming_both() {
        let np = netpath_with(Ipv6Verdict::Unknown);
        let err = run_with_netpath(&np, |_| async { Ok(out(1)) }, || {}).await.unwrap_err();
        assert!(err.contains("IPv6") && err.contains("IPv4"), "{err}");
    }

    #[tokio::test]
    async fn probe_unreachable_v6_is_broken() {
        // 100::/64 is the IPv6 discard prefix (RFC 6666): never reachable.
        let addr: std::net::SocketAddr = "[100::1]:443".parse().unwrap();
        let v = probe_addrs(&[addr], Duration::from_millis(300)).await;
        assert_eq!(v, Ipv6Verdict::Broken);
        assert_eq!(probe_addrs(&[], Duration::from_millis(300)).await, Ipv6Verdict::Broken);
    }

    #[tokio::test]
    async fn probe_timeout_bounds_the_whole_probe_not_each_address() {
        // Live finding: youtube.com publishes several AAAA records; a
        // per-address timeout tried in sequence took 24 s instead of 3 s.
        let addrs: Vec<std::net::SocketAddr> =
            (1..=6).map(|i| format!("[100::{i}]:443").parse().unwrap()).collect();
        let started = Instant::now();
        assert_eq!(probe_addrs(&addrs, Duration::from_millis(300)).await, Ipv6Verdict::Broken);
        assert!(started.elapsed() < Duration::from_millis(900), "took {:?}", started.elapsed());
    }

    /// Prints this network's real verdict (owner's home network 2026-10-27:
    /// Broken). Run: cargo test live_probe -- --ignored --nocapture
    #[tokio::test]
    #[ignore = "live network: probes www.youtube.com over IPv6"]
    async fn live_probe_reports_this_network() {
        let started = Instant::now();
        let v = probe_ipv6(PROBE_HOST, PROBE_TIMEOUT).await;
        println!("IPv6 verdict here: {v:?} in {:?}", started.elapsed());
        assert!(started.elapsed() < PROBE_TIMEOUT + Duration::from_secs(2));
    }

    #[test]
    fn set_persists_and_reloads() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("net-state.json");
        NetPath::load(path.clone()).set(Ipv6Verdict::Broken);
        assert_eq!(NetPath::load(path.clone()).current(), Ipv6Verdict::Broken);
        NetPath::load(path.clone()).set(Ipv6Verdict::Works);
        assert_eq!(NetPath::load(path.clone()).current(), Ipv6Verdict::Works);
        // A garbage file is Unknown, never an error.
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(NetPath::load(path).current(), Ipv6Verdict::Unknown);
    }
}
