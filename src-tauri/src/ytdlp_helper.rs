//! Persistent pre-warmed yt-dlp extractor helper (Task 2b —
//! docs/plans/2026-11-16-followups-plan.md, proven root cause §10 B: each
//! one-shot `yt-dlp -J` spawn pays 10–30 s of process start-up; a warm
//! in-process extraction takes 1.5–2.4 s).
//!
//! One long-lived Python process (`resources/ytdlp_helper.py`) is spawned at
//! app launch (the script imports `yt_dlp` once at start-up — that import is
//! the pre-warm), answers one line-delimited JSON request per stdin line, is
//! restarted on crash, killed with the app (`kill_on_drop`), and every request
//! is bounded by a 30 s timeout. Requests are SERIALIZED (one tokio mutex):
//! the helper is a single Python process doing one extraction at a time, and a
//! warm extraction is 1.5–2.4 s — serializing costs nothing against the 10–30 s
//! spawn it replaces. On ANY helper failure the caller falls back to the
//! one-shot `yt-dlp -J`.
//!
//! The interpreter is resolved from the yt-dlp binary's shebang (measured:
//! `#!/opt/homebrew/Cellar/yt-dlp/.../libexec/bin/python`); if that fails the
//! failure is logged loudly and the extractor runs one-shot only.
//!
//! Tests use a FAKE helper script in a temp dir (env overrides
//! EP_YTDLP_HELPER_SCRIPT / EP_YTDLP_PYTHON); the real helper is only exercised
//! by ignored live tests.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// Per-request timeout: a hung helper must never hang a click.
pub const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Resolve the Python interpreter from the yt-dlp binary's shebang line.
/// Handles `#!/usr/bin/env python3` via PATH lookup. Err means "cannot be
/// resolved" — the caller logs it loudly and falls back to one-shot yt-dlp.
pub fn python_from_ytdlp_shebang(yt_dlp: &Path) -> Result<String, String> {
    // A PATH-resolved bare name ("yt-dlp") can be read only relative to the
    // CWD — resolve it to an absolute location first (a packaged app's CWD
    // is not the shell's).
    let yt_dlp = if yt_dlp.as_os_str().to_string_lossy().contains('/') || yt_dlp.exists() {
        yt_dlp.to_path_buf()
    } else {
        which(yt_dlp.to_string_lossy().as_ref())
            .map(PathBuf::from)
            .ok_or_else(|| format!("yt-dlp binary {yt_dlp:?} not found on PATH"))?
    };
    let first = std::fs::read_to_string(&yt_dlp)
        .ok()
        .and_then(|s| s.lines().next().map(|l| l.to_string()))
        .ok_or_else(|| format!("cannot read {yt_dlp:?}"))?;
    let shebang = first
        .strip_prefix("#!")
        .ok_or_else(|| format!("{yt_dlp:?} has no shebang"))?
        .trim();
    if let Some(env_cmd) = shebang.strip_prefix("/usr/bin/env ") {
        let prog = env_cmd.split_whitespace().next().unwrap_or("");
        return which(prog).ok_or_else(|| format!("shebang interpreter {prog:?} not found on PATH"));
    }
    let interp = shebang.split_whitespace().next().unwrap_or("");
    if Path::new(interp).exists() {
        Ok(interp.to_string())
    } else {
        Err(format!("shebang interpreter {interp:?} does not exist"))
    }
}

fn which(prog: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    path.to_string_lossy()
        .split(':')
        .map(|d| format!("{d}/{prog}"))
        .find(|p| Path::new(p).exists())
}

struct HelperProc {
    child: Child,
    stdin: tokio::process::ChildStdin,
    stdout: BufReader<tokio::process::ChildStdout>,
}

impl HelperProc {
    async fn kill(&mut self) {
        let _ = self.child.start_kill();
        let _ = self.child.wait().await;
    }
}

/// The long-lived helper process handle. Clone-cheap (Arc inside).
pub struct YtdlpHelper {
    script: PathBuf,
    python: String,
    timeout: std::time::Duration,
    state: Arc<Mutex<Option<HelperProc>>>,
    /// Request ids are matched against responses — safe only because the
    /// mutex serializes, but a mismatched id is a protocol error, not a result.
    next_id: std::sync::atomic::AtomicU64,
}

impl YtdlpHelper {
    /// Production paths: helper script from the bundle resource dir (or the
    /// repo in dev), interpreter from the yt-dlp shebang. Env overrides
    /// (EP_YTDLP_HELPER_SCRIPT / EP_YTDLP_PYTHON) exist for tests.
    pub fn new(resource_dir: Option<PathBuf>, yt_dlp: &Path) -> Result<Self, String> {
        // Candidates in order: env override (tests), the bundle Resources dir
        // — flat name (map-form bundle.resources) AND the structure-preserved
        // subpath (Tauri v2 array-form preserves directories) — then the dev
        // repo path. First existing candidate wins; if none exists the first
        // is kept so spawn fails loudly and the caller falls back.
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Some(p) = std::env::var_os("EP_YTDLP_HELPER_SCRIPT") {
            candidates.push(PathBuf::from(p));
        } else if let Some(d) = resource_dir {
            candidates.push(d.join("ytdlp_helper.py"));
            candidates.push(d.join("resources/ytdlp_helper.py"));
        }
        candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ytdlp_helper.py"));
        let script = candidates
            .iter()
            .find(|p| p.exists())
            .cloned()
            .unwrap_or_else(|| candidates[0].clone());
        let python = match std::env::var_os("EP_YTDLP_PYTHON") {
            Some(p) => p.to_string_lossy().into_owned(),
            None => python_from_ytdlp_shebang(yt_dlp)?,
        };
        Ok(Self {
            script,
            python,
            timeout: REQUEST_TIMEOUT,
            state: Arc::new(Mutex::new(None)),
            next_id: std::sync::atomic::AtomicU64::new(1),
        })
    }

    /// The helper process pid (test/inspection only).
    #[cfg(test)]
    pub(crate) async fn pid(&self) -> Option<u32> {
        self.state.lock().await.as_ref().map(|p| p.child.id().unwrap_or(0))
    }

    #[cfg(test)]
    pub(crate) fn with_parts(script: PathBuf, python: String, timeout: std::time::Duration) -> Self {
        Self {
            script,
            python,
            timeout,
            state: Arc::new(Mutex::new(None)),
            next_id: std::sync::atomic::AtomicU64::new(1),
        }
    }

    /// Spawn the helper if not running. The script imports yt_dlp at start-up,
    /// so spawning IS the pre-warm.
    pub async fn ensure_running(&self) -> Result<(), String> {
        let mut guard = self.state.lock().await;
        if guard.is_some() {
            return Ok(());
        }
        *guard = Some(spawn(&self.script, &self.python).await?);
        Ok(())
    }

    /// One serialized request/response over the long-lived pipe. Returns the
    /// sanitized `info` object on success. Any transport failure (crash,
    /// timeout, bad json, dead pipe) kills and clears the process so the NEXT
    /// request respawns it — and returns Err so the caller falls back.
    pub async fn request(&self, video_id: &str, force_ipv4: bool) -> Result<serde_json::Value, String> {
        let mut guard = self.state.lock().await;
        if guard.is_none() {
            *guard = Some(spawn(&self.script, &self.python).await?);
        }
        let proc = guard.as_mut().expect("just ensured");
        let req_id = self.next_id.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let req = serde_json::json!({"id": req_id, "video_id": video_id, "force_ipv4": force_ipv4});
        let mut line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
        line.push('\n');
        let attempt = async {
            proc.stdin.write_all(line.as_bytes()).await.map_err(|e| e.to_string())?;
            proc.stdin.flush().await.map_err(|e| e.to_string())?;
            let mut out = String::new();
            proc.stdout.read_line(&mut out).await.map_err(|e| e.to_string())?;
            Ok::<String, String>(out)
        };
        let answered = tokio::time::timeout(self.timeout, attempt).await;
        let outcome: Result<String, String> = match answered {
            Ok(Ok(l)) if !l.trim().is_empty() => Ok(l),
            Ok(Ok(_)) => Err("helper closed stdout without answering".to_string()),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(format!("helper request timed out after {:?}", self.timeout)),
        };
        match outcome {
            Ok(l) => match serde_json::from_str::<serde_json::Value>(&l) {
                Ok(v) if v.get("id").and_then(|i| i.as_u64()) != Some(req_id) => {
                    // Protocol desync: kill + clear so the next request respawns.
                    if let Some(mut p) = guard.take() {
                        p.kill().await;
                    }
                    Err(format!("helper response id mismatch: sent {req_id}, got {:?}", v.get("id")))
                }
                Ok(v) if v.get("ok").and_then(|b| b.as_bool()) == Some(true) => {
                    Ok(v.get("info").cloned().unwrap_or(serde_json::Value::Null))
                }
                // The helper answered, but the extraction failed (e.g. video
                // unavailable): the process is healthy — report Err, keep it.
                Ok(v) => Err(v
                    .get("error")
                    .and_then(|e| e.as_str())
                    .unwrap_or("helper error")
                    .to_string()),
                Err(e) => {
                    if let Some(mut p) = guard.take() {
                        p.kill().await;
                    }
                    Err(format!("helper bad json: {e}: {l}"))
                }
            },
            Err(e) => {
                // Transport failure (crash/timeout/closed pipe): kill + clear so
                // the NEXT request respawns it; caller falls back meanwhile.
                if let Some(mut p) = guard.take() {
                    p.kill().await;
                }
                Err(e)
            }
        }
    }
}

async fn spawn(script: &Path, python: &str) -> Result<HelperProc, String> {
    if !script.exists() {
        return Err(format!("helper script missing: {script:?}"));
    }
    let mut child = Command::new(python)
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true) // killed with the app
        .spawn()
        .map_err(|e| format!("spawn helper {python} {script:?}: {e}"))?;
    // yt-dlp warnings/errors from the helper go to the app log at WARN
    // (Task 2c removed --no-warnings, so they must be visible).
    if let Some(stderr) = child.stderr.take() {
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                tracing::warn!("ytdlp-helper: {l}");
            }
        });
    }
    let stdin = child.stdin.take().ok_or("helper has no stdin")?;
    let stdout = child.stdout.take().ok_or("helper has no stdout")?;
    Ok(HelperProc {
        child,
        stdin,
        stdout: BufReader::new(stdout),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// A fake helper that answers every request with a canned info dict and
    /// appends its pid to `spawns` on start — so tests can prove ONE process
    /// served N requests (or that a crash respawned).
    fn fake_helper(dir: &Path, behavior: &str) -> PathBuf {
        let script = dir.join("fake_helper.py");
        let spawns = dir.join("spawns");
        let body = match behavior {
            "ok" => r#"
import json, os, sys
with open(sys.argv[1], "a") as f: f.write(str(os.getpid()) + "\n")
for line in sys.stdin:
    req = json.loads(line)
    print(json.dumps({"id": req["id"], "ok": True, "info": {"id": req["video_id"], "formats": []}}), flush=True)
"#,
            // crash on the request whose video_id is "crash": die mid-request
            "crash_on_crash_id" => r#"
import json, os, sys
with open(sys.argv[1], "a") as f: f.write(str(os.getpid()) + "\n")
for line in sys.stdin:
    req = json.loads(line)
    if req.get("video_id") == "crash":
        os._exit(1)
    print(json.dumps({"id": req["id"], "ok": True, "info": {"id": req["video_id"], "formats": []}}), flush=True)
"#,
            // hang forever: exercises the per-request timeout
            "hang" => r#"
import json, os, sys, time
with open(sys.argv[1], "a") as f: f.write(str(os.getpid()) + "\n")
for line in sys.stdin:
    time.sleep(3600)
"#,
            // answer with the WRONG id: a protocol desync must be an Err + respawn
            "wrong_id" => r#"
import json, os, sys
with open(sys.argv[1], "a") as f: f.write(str(os.getpid()) + "\n")
for line in sys.stdin:
    req = json.loads(line)
    print(json.dumps({"id": req["id"] + 1000, "ok": True, "info": {"id": req["video_id"]}}), flush=True)
"#,
            _ => unreachable!(),
        };
        std::fs::write(&script, format!("import sys\nsys.argv.append({:?})\n{}", spawns.display(), body)).unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        script
    }

    fn python3() -> String {
        which("python3").expect("python3 on PATH for tests")
    }

    #[tokio::test]
    async fn helper_reused_across_requests() {
        let dir = tempfile::tempdir().unwrap();
        let script = fake_helper(dir.path(), "ok");
        let h = YtdlpHelper::with_parts(script, python3(), std::time::Duration::from_secs(10));
        for i in 0..3 {
            let info = h.request(&format!("vid{i}"), true).await.expect("request ok");
            assert_eq!(info["id"].as_str(), Some(format!("vid{i}").as_str()));
        }
        let spawns = std::fs::read_to_string(dir.path().join("spawns")).unwrap();
        let pids: Vec<&str> = spawns.lines().collect();
        assert_eq!(pids.len(), 1, "ONE helper process served 3 requests: {pids:?}");
    }

    #[tokio::test]
    async fn helper_crash_restarts_then_serves() {
        let dir = tempfile::tempdir().unwrap();
        let script = fake_helper(dir.path(), "crash_on_crash_id");
        let h = YtdlpHelper::with_parts(script, python3(), std::time::Duration::from_secs(10));
        let first = h.request("vid1", false).await.expect("first request ok");
        assert_eq!(first["id"].as_str(), Some("vid1"));
        let crashed = h.request("crash", false).await;
        assert!(crashed.is_err(), "a crashed helper must surface Err, got {crashed:?}");
        let after = h.request("vid2", false).await.expect("helper respawned after crash");
        assert_eq!(after["id"].as_str(), Some("vid2"));
        let spawns = std::fs::read_to_string(dir.path().join("spawns")).unwrap();
        let pids: Vec<&str> = spawns.lines().collect();
        assert_eq!(pids.len(), 2, "crash → respawn: two helper processes total: {pids:?}");
        assert_ne!(pids[0], pids[1], "the second request ran on a NEW pid");
    }

    #[tokio::test]
    async fn helper_timeout_returns_err_and_respawns() {
        let dir = tempfile::tempdir().unwrap();
        let script = fake_helper(dir.path(), "hang");
        let h = YtdlpHelper::with_parts(script, python3(), std::time::Duration::from_secs(2));
        // Pre-spawn explicitly so the pid file is written before any timeout
        // race with interpreter startup.
        h.ensure_running().await.expect("pre-spawn");
        let r = h.request("vid", false).await;
        assert!(r.is_err(), "hung helper must time out, got {r:?}");
        assert!(r.unwrap_err().contains("timed out"));
        // next request must respawn (old one was killed) and also time out
        let r2 = h.request("vid", false).await;
        assert!(r2.is_err());
        let spawns = std::fs::read_to_string(dir.path().join("spawns")).unwrap();
        assert_eq!(spawns.lines().count(), 2, "each timed-out request spawned a fresh helper");
    }

    #[tokio::test]
    async fn helper_response_id_mismatch_is_an_err_and_respawns() {
        let dir = tempfile::tempdir().unwrap();
        let script = fake_helper(dir.path(), "wrong_id");
        let h = YtdlpHelper::with_parts(script, python3(), std::time::Duration::from_secs(10));
        let r = h.request("vid", false).await;
        assert!(r.is_err(), "wrong response id must Err, got {r:?}");
        assert!(r.unwrap_err().contains("id mismatch"));
        // the desynced process was killed; the next request respawns
        let r2 = h.request("vid", false).await;
        assert!(r2.is_err());
        let spawns = std::fs::read_to_string(dir.path().join("spawns")).unwrap();
        assert_eq!(spawns.lines().count(), 2, "id-mismatch must respawn: {spawns}");
    }

    #[test]
    fn missing_python_in_shebang_is_an_err_not_a_panic() {
        let dir = tempfile::tempdir().unwrap();
        let fake = dir.path().join("yt-dlp");
        std::fs::write(&fake, "#!/nonexistent/python\nimport sys\n").unwrap();
        let r = python_from_ytdlp_shebang(&fake);
        assert!(r.is_err(), "bogus shebang interpreter must Err: {r:?}");
        assert!(r.unwrap_err().contains("nonexistent"));
    }

    #[test]
    fn shebang_direct_path_and_env_form_resolve() {
        let dir = tempfile::tempdir().unwrap();
        let py = dir.path().join("pybin");
        std::fs::write(&py, "").unwrap();
        let fake = dir.path().join("yt-dlp");
        std::fs::write(&fake, format!("#!{}\nimport sys\n", py.display())).unwrap();
        assert_eq!(python_from_ytdlp_shebang(&fake).unwrap(), py.display().to_string());
        let fake2 = dir.path().join("yt-dlp2");
        std::fs::write(&fake2, "#!/usr/bin/env python3\n").unwrap();
        assert_eq!(python_from_ytdlp_shebang(&fake2).unwrap(), which("python3").unwrap());
    }

    #[tokio::test]
    async fn missing_helper_script_is_an_err() {
        let h = YtdlpHelper::with_parts(
            PathBuf::from("/nonexistent/ytdlp_helper.py"),
            python3(),
            std::time::Duration::from_secs(1),
        );
        let r = h.request("vid", false).await;
        assert!(r.is_err() && r.unwrap_err().contains("missing"), "missing script must Err loudly");
    }
}
