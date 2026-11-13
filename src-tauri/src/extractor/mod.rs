//! Video extraction using yt-dlp and Invidious/Piped APIs

use crate::types::*;
use tauri::AppHandle;
use serde::{Deserialize, Serialize};

pub struct Extractor {
    client: reqwest::Client,
    /// Resolved once on first use; the extractor lives in `Arc` managed state,
    /// so memoization uses `OnceLock` rather than `&mut`.
    yt_dlp_path: std::sync::OnceLock<String>,
    /// Which IP family reaches YouTube (crate::netpath): every yt-dlp call
    /// reads it, so a known-broken IPv6 network never costs a wait.
    netpath: std::sync::Arc<crate::netpath::NetPath>,
}

impl Extractor {
    /// The AppHandle parameter predates 1b: instance selection moved to the
    /// call sites (search/stream commands pass ordered candidates), so the
    /// extractor no longer reads any managed state. Kept in the signature to
    /// avoid touching the managed-state construction order in lib.rs.
    pub fn new(_app_handle: AppHandle, netpath: std::sync::Arc<crate::netpath::NetPath>) -> Self {
        Self::from_parts(netpath)
    }

    pub(crate) fn from_parts(netpath: std::sync::Arc<crate::netpath::NetPath>) -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("Mozilla/5.0 (compatible; EchoPrism/0.1)")
                .build()
                .expect("Failed to create HTTP client"),
            yt_dlp_path: std::sync::OnceLock::new(),
            netpath,
        }
    }

    /// Run yt-dlp with `args` under the current IPv6 verdict: IPv4 at once
    /// when the network is known-broken, otherwise dual-stack with a
    /// mid-flight switch to IPv4 the moment the background probe says so.
    async fn yt_dlp_output(&self, args: &[String]) -> Result<std::process::Output, String> {
        let yt_dlp = self.find_yt_dlp().await?;
        let netpath = self.netpath.clone();
        crate::netpath::run_with_netpath(
            &self.netpath,
            |v4| {
                let mut full = crate::netpath::yt_dlp_net_args(v4);
                full.extend(args.iter().cloned());
                let yt_dlp = yt_dlp.clone();
                async move {
                    tokio::process::Command::new(&yt_dlp)
                        .args(&full)
                        .kill_on_drop(true)
                        .output()
                        .await
                        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))
                }
            },
            move || netpath.request_probe(),
        )
        .await
    }

    /// Search YouTube through one instance's API. The instance type decides
    /// the endpoint and parser (Piped: /search?filter=videos; Invidious:
    /// /api/v1/search?type=video).
    pub async fn search_with_instance(&self, query: &str, instance: &Instance) -> Result<Vec<VideoInfo>, String> {
        let response = match instance.instance_type {
            InstanceType::Piped => self
                .client
                .get(format!("{}/search", instance.url.trim_end_matches('/')))
                .query(&[("q", query), ("filter", "videos")])
                .send()
                .await,
            InstanceType::Invidious => self
                .client
                .get(format!("{}/api/v1/search", instance.url.trim_end_matches('/')))
                .query(&[("q", query), ("type", "video")])
                .send()
                .await,
        }
        .map_err(|e| format!("Search request to {} failed: {}", instance.url, e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Instance {} returned {}",
                instance.url,
                response.status()
            ));
        }
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read search response: {}", e))?;
        match instance.instance_type {
            InstanceType::Piped => parse_piped_search(&body),
            InstanceType::Invidious => parse_invidious_search(&body),
        }
    }

    /// Search YouTube via a local yt-dlp binary (ytsearch20). The guaranteed
    /// fallback when no instance answers.
    pub async fn search_with_yt_dlp(&self, query: &str) -> Result<Vec<VideoInfo>, String> {
        let target = format!("ytsearch20:{}", query);
        let args: Vec<String> = ["--dump-json", "--flat-playlist", "--no-warnings", &target]
            .iter()
            .map(|a| a.to_string())
            .collect();
        let output = self
            .yt_dlp_output(&args)
            .await
            .map_err(|e| format!("yt-dlp search failed: {}", e))?;
        parse_yt_dlp_search(&String::from_utf8_lossy(&output.stdout))
    }

    /// Resolve a playable stream URL: try each candidate instance in order,
    /// then fall back to the local yt-dlp binary — the same failover policy
    /// as search.
    pub async fn resolve_stream(&self, video_id: &str, format: Option<&str>, quality: Option<&str>, candidates: &[Instance]) -> Result<StreamUrl, String> {
        // Handover 2026-10-22 item 3: the silent fallbacks logged nothing. An
        // empty candidate list means every instance is Failed (skipped by
        // order_for_search); reaching yt-dlp after attempts means all of them
        // errored. Both are visible now.
        if candidates.is_empty() {
            tracing::warn!(
                "resolve_stream({video_id}, format={format:?}): no healthy instance candidates — falling back to yt-dlp"
            );
        }
        let mut attempted = 0usize;
        for instance in candidates {
            attempted += 1;
            match self.get_stream_from_instance(video_id, instance, format, quality).await {
                Ok(stream) => return Ok(stream),
                Err(e) => tracing::debug!("instance {} failed for {video_id}: {e}", instance.url),
            }
        }
        if attempted > 0 {
            tracing::warn!(
                "resolve_stream({video_id}, format={format:?}): all {attempted} instance(s) failed — falling back to yt-dlp"
            );
        }
        self.get_stream_with_yt_dlp(video_id, format, quality).await
    }

    /// Phase E: the hover-preview storyboard for one video. Piped instances
    /// first (the /streams response the app already understands); when none
    /// serves previewFrames — TODAY's reality: the seeded instance's
    /// /streams is bot-blocked by YouTube — the local yt-dlp binary's own
    /// storyboard extraction takes over (sb formats, one invocation per id,
    /// LRU-cached by the caller). Both miss → None: the static thumbnail
    /// stays, never a stream-resolution churn.
    pub async fn preview_frames(&self, video_id: &str, candidates: &[Instance]) -> Option<StoryboardSpec> {
        for instance in candidates {
            let url = format!("{}/streams/{}", instance.url.trim_end_matches('/'), video_id);
            let attempt = tokio::time::timeout(
                std::time::Duration::from_secs(6),
                self.client.get(&url).send(),
            )
            .await;
            let Ok(Ok(response)) = attempt else { continue };
            if !response.status().is_success() {
                continue;
            }
            let Ok(body) = response.text().await else { continue };
            if let Some(spec) = parse_storyboard(&body) {
                return Some(spec);
            }
        }
        self.storyboard_with_yt_dlp(video_id).await
    }

    /// The guaranteed fallback: `yt-dlp -J --skip-download` and parse the sb
    /// formats. One invocation per call site miss (the caller's LRU bounds
    /// it to once per hovered id).
    async fn storyboard_with_yt_dlp(&self, video_id: &str) -> Option<StoryboardSpec> {
        let watch_url = format!("https://www.youtube.com/watch?v={video_id}");
        let args: Vec<String> = ["-J", "--skip-download", "--no-warnings", &watch_url]
            .iter()
            .map(|a| a.to_string())
            .collect();
        // A preview is decoration: keep its old 30 s bound on top of the policy.
        let output = tokio::time::timeout(std::time::Duration::from_secs(30), self.yt_dlp_output(&args))
            .await
            .ok()?
            .ok()?;
        parse_yt_dlp_storyboard(&String::from_utf8_lossy(&output.stdout))
    }
    
    /// Resolve a stream from one instance. The instance TYPE decides the
    /// endpoint and parser — this is the 1e fix: the code used the Invidious
    /// path for every instance, but the seeded default instance is Piped
    /// (Invidious-style /api/v1/videos/{id}/streams 404s on Piped; its
    /// streams live at /streams/{id} with a different response shape), so
    /// every instance attempt failed and resolution silently fell through
    /// to yt-dlp (measured against the live instance 2026-10-20).
    async fn get_stream_from_instance(&self, video_id: &str, instance: &Instance, format: Option<&str>, quality: Option<&str>) -> Result<StreamUrl, String> {
        match instance.instance_type {
            InstanceType::Piped => self.get_stream_from_piped(video_id, instance, format, quality).await,
            InstanceType::Invidious => {
                self.get_stream_from_invidious(video_id, instance, format, quality).await
            }
        }
    }

    async fn get_stream_from_piped(&self, video_id: &str, instance: &Instance, format: Option<&str>, quality: Option<&str>) -> Result<StreamUrl, String> {
        let url = format!("{}/streams/{}", instance.url.trim_end_matches('/'), video_id);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        if !response.status().is_success() {
            return Err("Stream not available from instance".to_string());
        }
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read streams: {}", e))?;
        // Piped returns every tier in one response — no query params — so
        // both filters apply at selection time (review finding, 1e).
        select_piped_stream(parse_piped_streams(&body)?, format, quality)
    }

    async fn get_stream_from_invidious(&self, video_id: &str, instance: &Instance, format: Option<&str>, quality: Option<&str>) -> Result<StreamUrl, String> {
        let url = format!("{}/api/v1/videos/{}/streams", instance.url.trim_end_matches('/'), video_id);

        let mut query = vec![];
        if let Some(f) = format { query.push(("format", f.to_string())); }
        if let Some(q) = quality { query.push(("quality", q.to_string())); }

        // The shared client, not a per-call Client::new() — one user agent
        // and connection reuse for the whole pool.
        let response = self
            .client
            .get(&url)
            .query(&query)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            return Err("Stream not available from instance".to_string());
        }

        let streams: Vec<InvidiousStream> = response.json().await
            .map_err(|e| format!("Failed to parse streams: {}", e))?;

        let stream = streams.into_iter()
            .filter(|s| format.map_or(true, |f| s.format.contains(f)))
            .filter(|s| quality.map_or(true, |q| s.quality.contains(q)))
            .max_by_key(|s| s.quality.parse::<u32>().unwrap_or(0))
            .ok_or("No suitable stream found")?;

        Ok(StreamUrl {
            url: stream.url,
            format: stream.format,
            quality: stream.quality,
            headers: None,
        })
    }
    
    /// A proxy refresh callback: re-run yt-dlp -J and return a fresh
    /// (url, headers) for the SAME format the stream started on (a different
    /// format mid-stream would splice another container's bytes), falling
    /// back to the top-ranked one. Waits for the fresh URL's `available_at`
    /// before handing it over — a brand-new URL 403s until then.
    fn refresh_ytdlp_url(&self, video_id: &str, want_audio: bool, format_id: Option<String>) -> Option<crate::stream_proxy::RefreshFn> {
        let netpath = self.netpath.clone();
        let bin = self.yt_dlp_path.get().cloned().unwrap_or_else(|| "yt-dlp".to_string());
        let vid = video_id.to_string();
        Some(std::sync::Arc::new(move || {
            let netpath = netpath.clone();
            let bin = bin.clone();
            let vid = vid.clone();
            let format_id = format_id.clone();
            Box::pin(async move {
                let args = vec![
                    "--no-playlist".to_string(),
                    "--no-warnings".to_string(),
                    "-J".to_string(),
                    format!("https://www.youtube.com/watch?v={vid}"),
                ];
                let out = crate::netpath::run_with_netpath(
                    &netpath,
                    |v4| {
                        let mut full = crate::netpath::yt_dlp_net_args(v4);
                        full.extend(args.iter().cloned());
                        let bin = bin.clone();
                        async move {
                            tokio::process::Command::new(&bin)
                                .args(&full)
                                .kill_on_drop(true)
                                .output()
                                .await
                                .map_err(|e| e.to_string())
                        }
                    },
                    || {},
                )
                .await
                .ok()?;
                let dump: YtDlpDump = serde_json::from_slice(&out.stdout).ok()?;
                let ranked = rank_yt_dlp_formats(&dump.formats, want_audio);
                let cand = format_id
                    .as_deref()
                    .and_then(|id| ranked.iter().find(|f| f.format_id.as_deref() == Some(id)).cloned())
                    .or_else(|| ranked.into_iter().next())?;
                wait_until_available(&cand).await;
                let url = cand.url.clone().filter(|u| !u.is_empty()).or(cand.manifest_url.clone())?;
                Some((url, cand.http_headers.clone().unwrap_or_default()))
            })
        }))
    }

    async fn get_stream_with_yt_dlp(&self, video_id: &str, format: Option<&str>, quality: Option<&str>) -> Result<StreamUrl, String> {
        // -J: the full JSON carries each format's url AND its http_headers.
        // googlevideo URLs are useless to a webview media element without
        // those headers (live 2026-11-04: Piped /streams is 500-gated, so
        // yt-dlp is the only source and its raw URL failed to load —
        // "Stream error"). Headered URLs go through the local stream proxy.
        let args = vec![
            "--no-playlist".into(),
            "--no-warnings".into(),
            "-J".into(),
            format!("https://www.youtube.com/watch?v={}", video_id),
        ];
        let output = self.yt_dlp_output(&args).await?;
        let dump: YtDlpDump = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("yt-dlp -J parse failed: {e}"))?;
        let want_audio = format.map_or(false, |f| f.eq_ignore_ascii_case("audio"));
        // Round 5 (owner 2026-11-05: audio-only of YouTube still failed): a
        // googlevideo edge can 403 a URL that another edge served fine a
        // minute ago (measured live: same format, 403 then 206). So don't pick
        // one candidate blindly — probe each (through the proxy when it has
        // headers) with a 1-byte Range GET and take the first that answers
        // 200/206.
        let candidates = rank_yt_dlp_formats(&dump.formats, want_audio);
        if candidates.is_empty() {
            return Err("yt-dlp returned no usable stream format".to_string());
        }
        let probe = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("probe client");
        let mut last_err = String::new();
        for cand in &candidates {
            let url = cand.url.clone().filter(|u| !u.is_empty())
                .or_else(|| cand.manifest_url.clone());
            let Some(url) = url else { continue };
            let headers = cand.http_headers.clone().unwrap_or_default();
            // Round 6 root cause: googlevideo 403s a URL until its
            // `available_at` (~4 s after extraction). Probing at once 403'd
            // every real format (the earlier 'URLs expire within seconds'
            // reading was this, inverted).
            wait_until_available(cand).await;
            let serve_url = if headers.is_empty() {
                url.clone()
            } else {
                // The proxy re-resolves via this closure when upstream 403s
                // (e.g. a URL past its ~6 h expiry), keeping the SAME format.
                crate::stream_proxy::register_with_refresh(
                    &url,
                    headers,
                    self.refresh_ytdlp_url(video_id, want_audio, cand.format_id.clone()),
                )
            };
            match probe.get(&serve_url).header("Range", "bytes=0-0").send().await {
                Ok(r) if (r.status().is_success() || r.status() == 206)
                    && !is_media_content_type(r.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok())) =>
                {
                    last_err = format!("{} -> not media ({:?})", url_host(&url), r.headers().get(reqwest::header::CONTENT_TYPE));
                }
                Ok(r) if r.status().is_success() || r.status() == 206 => {
                    let host = r.url().host_str().unwrap_or("?").to_string();
                    tracing::info!("yt-dlp stream candidate OK: host={host} status={} -> {serve_url}", r.status());
                    let kind = if want_audio { "m4a".to_string() } else { cand.ext.clone().unwrap_or_else(|| "mp4".into()) };
                    return Ok(StreamUrl { url: serve_url, format: kind, quality: quality.unwrap_or("auto").to_string(), headers: None });
                }
                Ok(r) => { last_err = format!("{} -> HTTP {}", url_host(&url), r.status()); }
                Err(e) => { last_err = format!("{} -> {e}", url_host(&url)); }
            }
        }
        Err(format!("all yt-dlp stream candidates failed (last: {last_err})"))
    }
    
    async fn find_yt_dlp(&self) -> Result<String, String> {
        if let Some(path) = self.yt_dlp_path.get() {
            return Ok(path.clone());
        }

        // Try common locations. A candidate only counts when the binary
        // actually runs (spawn success alone is not success — a missing
        // binary surfaces as Err(NotFound), a broken one as a failing exit
        // status; both are rejected here).
        let candidates = ["yt-dlp", "/usr/local/bin/yt-dlp", "/opt/homebrew/bin/yt-dlp"];

        for cmd in candidates {
            match tokio::process::Command::new(cmd).arg("--version").output().await {
                Ok(output) if output.status.success() => {
                    let _ = self.yt_dlp_path.set(cmd.to_string());
                    return Ok(cmd.to_string());
                }
                _ => continue,
            }
        }

        Err("yt-dlp not found. Install it with: brew install yt-dlp".to_string())
    }
}

/// Recorded-response shape (fixtures/piped_streams.json, real capture
/// 2026-10-20 from pipedapi.ducks.party): Piped's `/streams/{id}` returns
/// ONE object with two stream arrays, camelCase keys. Entries are parsed
/// permissively (serde defaults) so a missing field never kills the parse.
/// Note the real capture's audioStreams are EMPTY (PO-token gating) — audio
/// requests fall back to the best combined mp4 video stream (see
/// select_piped_stream); only when that is impossible does resolve_stream
/// fall through to yt-dlp.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PipedStreams {
    audio_streams: Vec<PipedStreamEntry>,
    video_streams: Vec<PipedStreamEntry>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PipedStreamEntry {
    url: String,
    /// "MP4" / "HLS" / "MPEG_4" in the recorded capture
    format: Option<String>,
    /// "720p" / "360p" / "LBRY" / "96 kbps"
    quality: Option<String>,
    itag: Option<i64>,
    mime_type: Option<String>,
    /// true for video-only streams (no audio track) — must be excluded when
    /// the caller wants audio.
    video_only: Option<bool>,
}

/// Phase E: a hover-preview storyboard — sprite-sheet pages + per-frame
/// timing, the same mechanism YouTube's own hover preview uses. Sourced
/// from Piped's `previewFrames` (the /streams response the app already
/// parses for playback); absent when no instance serves it, in which case
/// the UI degrades to the static thumbnail (the unplug-safe degradation).
#[derive(Debug, Clone, Serialize)]
pub struct StoryboardSpec {
    pub urls: Vec<String>,
    pub frame_width: u32,
    pub frame_height: u32,
    pub frames_per_page_x: u32,
    pub frames_per_page_y: u32,
    pub duration_per_frame_ms: u64,
    pub total_count: u32,
}

/// Pick the most detailed level at or below 480px wide (the 160×90 level
/// beats 80×45; a hypothetical 480 would win over both), falling back to
/// the smallest level when everything is larger.
pub(crate) fn parse_storyboard(body: &str) -> Option<StoryboardSpec> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PfLevel {
        #[serde(default)]
        urls: Vec<String>,
        #[serde(default)]
        frame_width: Option<u32>,
        #[serde(default)]
        frame_height: Option<u32>,
        #[serde(default)]
        frames_per_page_x: Option<u32>,
        #[serde(default)]
        frames_per_page_y: Option<u32>,
        #[serde(default)]
        duration_per_frame: Option<u64>,
        #[serde(default)]
        total_count: Option<u32>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PfBody {
        #[serde(default)]
        preview_frames: Vec<PfLevel>,
    }

    let parsed: PfBody = serde_json::from_str(body).ok()?;
    let usable: Vec<&PfLevel> = parsed
        .preview_frames
        .iter()
        .filter(|l| !l.urls.is_empty() && l.frame_width.unwrap_or(0) > 0)
        .collect();
    if usable.is_empty() {
        return None;
    }
    let level = usable
        .iter()
        .filter(|l| l.frame_width.unwrap_or(0) <= 480)
        .max_by_key(|l| l.frame_width.unwrap_or(0))
        .or_else(|| usable.iter().min_by_key(|l| l.frame_width.unwrap_or(0)))?;
    Some(StoryboardSpec {
        urls: level.urls.clone(),
        frame_width: level.frame_width.unwrap_or(160),
        frame_height: level.frame_height.unwrap_or(90),
        frames_per_page_x: level.frames_per_page_x.unwrap_or(1).max(1),
        frames_per_page_y: level.frames_per_page_y.unwrap_or(1).max(1),
        duration_per_frame_ms: level.duration_per_frame.unwrap_or(300),
        total_count: level.total_count.unwrap_or(0),
    })
}

/// Phase E (the yt-dlp fallback, slipped from v1): parse a `yt-dlp -J`
/// dump's STORYBOARD formats into a StoryboardSpec. The sb formats carry
/// width/height = FRAME size, columns/rows = the sheet grid, and one
/// fragment per sheet page. The largest frame at or below 480px wins (sb0
/// is the largest YouTube level; sbN grows as frames shrink). DOC-DERIVED
/// fixture: YouTube is bot-blocking watch-page extraction on this machine
/// today (2026-10-24, live); the shape is yt-dlp's stable sb contract —
/// re-verify against a live capture when the block lifts.
pub(crate) fn parse_yt_dlp_storyboard(body: &str) -> Option<StoryboardSpec> {
    #[derive(Deserialize)]
    struct SbFormat {
        #[serde(default)]
        format_id: Option<String>,
        #[serde(default)]
        width: Option<u32>,
        #[serde(default)]
        height: Option<u32>,
        #[serde(default)]
        columns: Option<u32>,
        #[serde(default)]
        rows: Option<u32>,
        #[serde(default)]
        fps: Option<f64>,
        #[serde(default)]
        url: Option<String>,
        #[serde(default)]
        fragments: Vec<SbFragment>,
    }
    #[derive(Deserialize)]
    struct SbFragment {
        #[serde(default)]
        url: Option<String>,
    }
    #[derive(Deserialize)]
    struct Body {
        #[serde(default)]
        formats: Vec<SbFormat>,
    }

    let parsed: Body = serde_json::from_str(body).ok()?;
    let sbs: Vec<&SbFormat> = parsed
        .formats
        .iter()
        .filter(|f| f.format_id.as_deref().map(|id| id.starts_with("sb")).unwrap_or(false))
        .collect();
    let level = sbs
        .iter()
        .filter(|f| f.width.unwrap_or(0) > 0 && f.width.unwrap_or(0) <= 480)
        .max_by_key(|f| f.width.unwrap_or(0))
        .or_else(|| sbs.iter().min_by_key(|f| f.width.unwrap_or(0)))?;

    let urls: Vec<String> = if level.fragments.is_empty() {
        level.url.clone().into_iter().collect()
    } else {
        level.fragments.iter().filter_map(|f| f.url.clone()).collect()
    };
    if urls.is_empty() {
        return None;
    }
    Some(StoryboardSpec {
        urls,
        frame_width: level.width.unwrap_or(160),
        frame_height: level.height.unwrap_or(90),
        frames_per_page_x: level.columns.unwrap_or(1).max(1),
        frames_per_page_y: level.rows.unwrap_or(1).max(1),
        duration_per_frame_ms: level
            .fps
            .filter(|f| *f > 0.0)
            .map(|f| (1000.0 / f) as u64)
            .unwrap_or(1000),
        total_count: (level.columns.unwrap_or(1) * level.rows.unwrap_or(1))
            * level.fragments.len().max(1) as u32,
    })
}

fn parse_piped_streams(body: &str) -> Result<PipedStreams, String> {
    serde_json::from_str(body).map_err(|e| format!("Failed to parse Piped streams: {}", e))
}

/// Numeric rank of a Piped quality string ("360p" → 360, "96 kbps" → 96,
/// unparseable → 0) for best-pick ordering.
fn piped_quality_rank(quality: &Option<String>) -> u64 {
    quality
        .as_deref()
        .and_then(|q| {
            let digits: String = q.chars().take_while(|c| c.is_ascii_digit()).collect();
            digits.parse::<u64>().ok()
        })
        .unwrap_or(0)
}

/// Pick the best Piped stream for the requested format/quality. `format`
/// "audio" (case-insensitive) selects audioStreams; anything else selects
/// videoStreams. `quality` is a substring filter on the quality label when
/// given. Best pick = highest numeric quality rank.
///
/// Audio fallback (live 2026-11-03): Piped's audioStreams are EMPTY under
/// PO-token gating (verified on the live instance and in the committed
/// fixture), and erroring there pushed resolution to the yt-dlp fallback —
/// whose direct googlevideo URL carries no headers and cannot be loaded by
/// the webview media element ("Stream error" on every audio-only play).
/// A combined (audio+video) mp4 plays fine in an <audio> element, so when no
/// audio stream is published, audio falls back to the best combined mp4
/// video stream (skipping video-only and HLS/DASH manifests, which an audio
/// element cannot use).
fn select_piped_stream(
    streams: PipedStreams,
    format: Option<&str>,
    quality: Option<&str>,
) -> Result<StreamUrl, String> {
    let want_audio = matches!(format, Some(f) if f.eq_ignore_ascii_case("audio"));
    let quality_ok = |s: &PipedStreamEntry| {
        quality.map_or(true, |q| s.quality.as_deref().map_or(false, |sq| sq.contains(q)))
    };
    let into_url = |best: PipedStreamEntry| StreamUrl {
        url: best.url,
        format: best.format.unwrap_or_else(|| "mp4".to_string()),
        quality: best.quality.unwrap_or_else(|| "720p".to_string()),
        headers: None,
    };

    if want_audio {
        let best = streams
            .audio_streams
            .into_iter()
            .filter(|s| !s.url.is_empty())
            .filter(quality_ok)
            .max_by_key(|s| piped_quality_rank(&s.quality));
        if let Some(best) = best {
            return Ok(into_url(best));
        }
        let best = streams
            .video_streams
            .into_iter()
            .filter(|s| !s.url.is_empty())
            .filter(|s| !s.video_only.unwrap_or(false))
            .filter(|s| {
                s.format
                    .as_deref()
                    .map_or(true, |f| !matches!(f.to_ascii_uppercase().as_str(), "HLS" | "DASH"))
            })
            .max_by_key(|s| piped_quality_rank(&s.quality));
        if let Some(best) = best {
            return Ok(into_url(best));
        }
        return Err("No suitable stream found".to_string());
    }

    let best = streams
        .video_streams
        .into_iter()
        .filter(|s| !s.url.is_empty())
        .filter(quality_ok)
        .max_by_key(|s| piped_quality_rank(&s.quality))
        .ok_or("No suitable stream found")?;

    Ok(into_url(best))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvidiousThumbnail {
    pub url: String,
    pub width: u32,
    pub height: u32,
    pub quality: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvidiousStream {
    pub format: String,
    pub quality: String,
    pub url: String,
    pub itag: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub duration: Option<u64>,
    pub thumbnail: Option<String>,
    pub channel: Option<String>,
    pub channel_id: Option<String>,
    pub upload_date: Option<String>,
    pub view_count: Option<u64>,
    pub formats: Vec<VideoFormat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFormat {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub filesize: Option<u64>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamUrl {
    pub url: String,
    pub format: String,
    pub quality: String,
    pub headers: Option<std::collections::HashMap<String, String>>,
}

// ---- Search ----------------------------------------------------------------
//
// YouTube search, three backends, one normalized result type. Piped and
// Invidious serve users who add instances (public ones have disabled their
// APIs); yt-dlp is the guaranteed fallback when no instance answers.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipedSearchResponse {
    #[serde(default)]
    items: Vec<PipedSearchItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipedSearchItem {
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    uploader_name: Option<String>,
    #[serde(default)]
    uploader_url: Option<String>,
    #[serde(default)]
    duration: Option<i64>,
    #[serde(default)]
    views: Option<i64>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    uploaded_date: Option<String>,
    #[serde(default)]
    short_description: Option<String>,
}

/// DOC-DERIVED shape, deliberately: the public Invidious API is disabled
/// ecosystem-wide (official registry marks every instance api:false; verified
/// 2026-10-20), so only user-added private instances can serve this. Field
/// names follow the documented /api/v1/search response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InvidiousSearchItem {
    #[serde(default)]
    r#type: Option<String>,
    #[serde(default)]
    video_id: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    author_id: Option<String>,
    #[serde(default)]
    length_seconds: Option<i64>,
    #[serde(default)]
    view_count: Option<i64>,
    #[serde(default)]
    published_text: Option<String>,
    #[serde(default)]
    video_thumbnails: Vec<InvidiousThumbnail>,
}

/// Extract the YouTube video id from a Piped "/watch?v=<id>[&...]" URL.
fn video_id_from_watch_url(url: &str) -> Option<String> {
    let rest = url.split("v=").nth(1)?;
    let id = rest.split('&').next().unwrap_or("");
    (!id.is_empty()).then(|| id.to_string())
}

/// Pull the YouTube channel id out of a Piped uploader URL. Only
/// "/channel/<id>" carries the real UC id; "/@handle" URLs stay None so the
/// name-derived fallback keys them (review finding 2026-10-20: without this,
/// the same creator keyed differently per backend and got duplicate channel
/// rows).
fn channel_id_from_uploader_url(url: &str) -> Option<String> {
    let rest = url.strip_prefix("/channel/")?;
    let id = rest.split('/').next().unwrap_or("");
    (!id.is_empty()).then(|| id.to_string())
}

/// Parse a Piped /search response. Malformed JSON is an Err; items without a
/// parseable watch URL (channel/playlist cards) are skipped.
fn parse_piped_search(body: &str) -> Result<Vec<VideoInfo>, String> {
    let resp: PipedSearchResponse = serde_json::from_str(body)
        .map_err(|e| format!("Failed to parse Piped search response: {}", e))?;
    Ok(resp
        .items
        .into_iter()
        .filter_map(|item| {
            let id = video_id_from_watch_url(item.url.as_deref().unwrap_or(""))?;
            Some(VideoInfo {
                id,
                title: item.title.unwrap_or_default(),
                description: item.short_description,
                duration: item.duration.map(|d| d.max(0) as u64),
                thumbnail: item.thumbnail,
                channel: item.uploader_name,
                channel_id: item
                    .uploader_url
                    .as_deref()
                    .and_then(channel_id_from_uploader_url),
                upload_date: item.uploaded_date,
                view_count: item.views.map(|v| v.max(0) as u64),
                formats: Vec::new(),
            })
        })
        .collect())
}

/// Parse an Invidious /api/v1/search response. Items that are not videos
/// (channels, playlists) are skipped.
fn parse_invidious_search(body: &str) -> Result<Vec<VideoInfo>, String> {
    let items: Vec<InvidiousSearchItem> = serde_json::from_str(body)
        .map_err(|e| format!("Failed to parse Invidious search response: {}", e))?;
    Ok(items
        .into_iter()
        .filter(|i| i.r#type.as_deref().unwrap_or("video") == "video")
        .filter_map(|item| {
            let id = item.video_id?;
            Some(VideoInfo {
                id,
                title: item.title.unwrap_or_default(),
                description: None,
                duration: item.length_seconds.map(|d| d.max(0) as u64),
                thumbnail: item.video_thumbnails.last().map(|t| t.url.clone()),
                channel: item.author,
                channel_id: item.author_id,
                upload_date: item.published_text,
                view_count: item.view_count.map(|v| v.max(0) as u64),
                formats: Vec::new(),
            })
        })
        .collect())
}

/// Parse yt-dlp search output: either a JSON array (fixtures/tests) or JSONL —
/// one object per line, the live `--dump-json --flat-playlist` format.
/// yt-dlp arguments for ONE playable URL. The player sends a logical format
/// ('video' | 'audio'), never a yt-dlp selector — passing it through as
/// `-f video` fails with "Requested format is not available" on every video.
/// YouTube no longer serves muxed (audio+video) files, so:
///   - audio: the m4a/AAC stream (plays in WebKit; webm/opus may not);
///   - video: the HLS MASTER manifest of an H.264 variant — it lists every
///     resolution plus the separate audio rendition, and WebKit's native HLS
///     joins them and adapts quality itself (measured 2026-10-22: 16 avc1
///     variants with AUDIO groups, fetchable without extra headers).
/// A yt-dlp `-J` dump, reduced to the fields stream selection needs.
#[derive(Debug, Deserialize)]
struct YtDlpDump {
    #[serde(default)]
    formats: Vec<YtDlpFormat>,
}

#[derive(Debug, Deserialize, Clone)]
struct YtDlpFormat {
    #[serde(default)]
    format_id: Option<String>,
    /// Unix time before which googlevideo 403s this URL (yt-dlp's own
    /// downloader sleeps until it: "Sleeping N seconds as required by the
    /// site"). Measured live 2026-11-05: ~4 s after extraction; t+0 403,
    /// t+2..8 206 on the same URL.
    #[serde(default)]
    available_at: Option<f64>,
    url: Option<String>,
    manifest_url: Option<String>,
    http_headers: Option<std::collections::HashMap<String, String>>,
    ext: Option<String>,
    vcodec: Option<String>,
    acodec: Option<String>,
    abr: Option<f64>,
    height: Option<u32>,
    protocol: Option<String>,
}

fn is_none_codec(c: &Option<String>) -> bool {
    c.as_deref().map_or(true, |c| c == "none")
}

/// Longest we wait for a format's `available_at`: a bogus far-future value
/// must not hang playback (the probe then 403s and the honest error shows).
const MAX_AVAILABLE_AT_WAIT: std::time::Duration = std::time::Duration::from_secs(10);

/// Sleep until `available_at` has passed (plus a small clock-skew margin),
/// capped at MAX_AVAILABLE_AT_WAIT. No-op when the field is absent or past.
async fn wait_until_available(f: &YtDlpFormat) {
    let Some(at) = f.available_at else { return };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);
    let delay = at - now + 0.3;
    if delay > 0.0 {
        let d = std::time::Duration::from_secs_f64(delay).min(MAX_AVAILABLE_AT_WAIT);
        tracing::info!("yt-dlp format not available yet; waiting {:.1}s (available_at)", d.as_secs_f64());
        tokio::time::sleep(d).await;
    }
}

/// A probe answer is media only if it is not an image/text body (a
/// storyboard sprite answers 206 image/webp; WebKit then fails with
/// MediaError 4). A missing Content-Type is given the benefit of the doubt.
fn is_media_content_type(ct: Option<&str>) -> bool {
    ct.is_none_or(|ct| {
        let ct = ct.trim().to_ascii_lowercase();
        !(ct.starts_with("image/") || ct.starts_with("text/"))
    })
}

fn url_host(url: &str) -> &str {
    url.split('/').nth(2).unwrap_or("?")
}

/// All usable formats as an ordered candidate list: audio → progressive
/// audio-only by abr desc, then progressive muxed, then manifests; video →
/// progressive muxed by height desc, then manifests. The resolver probes each
/// in order (see get_stream_with_yt_dlp).
fn rank_yt_dlp_formats(formats: &[YtDlpFormat], want_audio: bool) -> Vec<YtDlpFormat> {
    // Storyboards (sb*, protocol mhtml) are scrubber-preview IMAGES, never a
    // stream (round 6: one was served to <video> -> MediaError 4).
    let usable = |f: &YtDlpFormat| {
        f.protocol.as_deref() != Some("mhtml")
            && (f.url.as_ref().is_some_and(|u| !u.is_empty()) || f.manifest_url.is_some())
    };
    let progressive = |f: &YtDlpFormat| {
        f.url.as_ref().map_or(false, |u| !u.is_empty())
            && f.protocol.as_deref().map_or(true, |p| p.starts_with("http"))
    };
    let cands: Vec<YtDlpFormat> = formats.iter().filter(|f| usable(f)).cloned().collect();
    if want_audio {
        let (audio_only, rest): (Vec<_>, Vec<_>) = cands.into_iter().partition(|f| progressive(f) && is_none_codec(&f.vcodec) && !is_none_codec(&f.acodec));
        let mut audio_only = audio_only;
        audio_only.sort_by(|a, b| b.abr.unwrap_or(0.0).partial_cmp(&a.abr.unwrap_or(0.0)).unwrap_or(std::cmp::Ordering::Equal));
        let mut rest: Vec<_> = rest.into_iter().filter(|f| progressive(f)).collect();
        rest.sort_by_key(|f| f.height.unwrap_or(0));
        audio_only.extend(rest);
        audio_only.extend(formats.iter().filter(|f| usable(f) && !progressive(f)).cloned());
        audio_only
    } else {
        let (muxed, rest): (Vec<_>, Vec<_>) = cands.into_iter().partition(|f| progressive(f) && !is_none_codec(&f.vcodec) && !is_none_codec(&f.acodec));
        let mut muxed = muxed;
        muxed.sort_by_key(|f| f.height.unwrap_or(0));
        muxed.extend(rest);
        muxed.extend(formats.iter().filter(|f| usable(f) && !progressive(f)).cloned());
        muxed
    }
}

/// Pick the best format for the logical kind — now just the head of the
/// ranked candidate list (the resolver probes candidates in order; round 5).
#[cfg(test)]
fn pick_yt_dlp_format(formats: &[YtDlpFormat], want_audio: bool, _quality: Option<&str>) -> Option<YtDlpFormat> {
    rank_yt_dlp_formats(formats, want_audio).into_iter().next()
}

/// 2h: card-appropriate thumbnail from a yt-dlp `thumbnails` list — the
/// SMALLEST variant at or above 300 px (the live list's 360-wide signed crop
/// measures 24 KB where the 720-wide one measures 60–220 KB; a 50-card
/// search pulled 3–11 MB, which IS the "thumbnails load slowly" report).
/// Nothing at or above 300 → the largest below (a small image beats none).
/// Replaces `max_by_key(width)`, the 2d policy that chose the widest
/// variant when the problem was "no thumbnail at all".
fn pick_card_thumbnail(thumbnails: Vec<YtDlpThumbnail>) -> Option<String> {
    let mut candidates: Vec<(u32, String)> = thumbnails
        .into_iter()
        .map(|t| (t.width.unwrap_or(0), t.url))
        .collect();
    if candidates.is_empty() {
        return None;
    }
    candidates.sort_by_key(|(w, _)| *w);
    let above = candidates.iter().filter(|(w, _)| *w >= 300);
    match above.min_by_key(|(w, _)| *w) {
        Some((_, url)) => Some(url.clone()),
        None => candidates.last().map(|(_, url)| url.clone()),
    }
}

/// One thumbnail variant of a yt-dlp --flat-playlist entry (width is absent
/// on some captures). Module level since 2h: the card-appropriate picker
/// works over the list too.
#[derive(Debug, Deserialize)]
struct YtDlpThumbnail {
    url: String,
    #[serde(default)]
    width: Option<u32>,
}

fn parse_yt_dlp_search(body: &str) -> Result<Vec<VideoInfo>, String> {
    #[derive(Debug, Deserialize)]
    struct YtDlpSearchEntry {
        #[serde(default)]
        id: Option<String>,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        duration: Option<f64>,
        #[serde(default)]
        channel: Option<String>,
        #[serde(default)]
        channel_id: Option<String>,
        #[serde(default)]
        view_count: Option<u64>,
        /// --flat-playlist has no single `thumbnail`, only this list.
        #[serde(default)]
        thumbnails: Vec<YtDlpThumbnail>,
    }

    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err("yt-dlp search produced no output".to_string());
    }
    let entries: Vec<YtDlpSearchEntry> = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(array_err) => {
            let mut entries = Vec::new();
            for line in trimmed.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                match serde_json::from_str::<YtDlpSearchEntry>(line) {
                    Ok(e) => entries.push(e),
                    Err(e) => {
                        return Err(format!(
                            "Failed to parse yt-dlp output: {} (array parse: {})",
                            e, array_err
                        ))
                    }
                }
            }
            entries
        }
    };
    Ok(entries
        .into_iter()
        .filter_map(|e| {
            let id = e.id?;
            let thumbnail = pick_card_thumbnail(e.thumbnails);
            Some(VideoInfo {
                id,
                title: e.title.unwrap_or_default(),
                description: None,
                duration: e.duration.map(|d| d.max(0.0) as u64),
                thumbnail,
                channel: e.channel,
                channel_id: e.channel_id,
                upload_date: None,
                view_count: e.view_count,
                formats: Vec::new(),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An extractor whose "yt-dlp" is a script that (a) records its argv to
    /// `<dir>/args` and (b) emits a `-J` dump whose format URL points at a
    /// local responder (so the resolver's probe gets a real 200). The
    /// responder runs on the tauri runtime for the test's lifetime.
    /// `with_headers` makes the format carry http_headers, which must route
    /// the URL through the local stream proxy.
    fn extractor_with_echo_ytdlp(v: crate::netpath::Ipv6Verdict, with_headers: bool) -> (Extractor, tempfile::TempDir) {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("yt-dlp");
        let args_file = dir.path().join("args");
        let headers = if with_headers {
            r#","http_headers":{"User-Agent":"EchoPrism-test"}"#
        } else {
            ""
        };
        // responder: any GET → 200 with 2 bytes
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let rport = listener.local_addr().unwrap().port();
        let _ = listener.set_nonblocking(true);
        tauri::async_runtime::spawn(async move {
            let listener = tokio::net::TcpListener::from_std(listener).unwrap();
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            while let Ok((mut sock, _)) = listener.accept().await {
                tauri::async_runtime::spawn(async move {
                    let mut buf = vec![0u8; 2048];
                    let _ = sock.read(&mut buf).await;
                    let _ = sock.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok").await;
                });
            }
        });
        std::fs::write(
            &bin,
            format!(
                "#!/bin/sh\nprintf '%s' \"$*\" > '{}'\nprintf '{{\"formats\":[{{\"url\":\"http://127.0.0.1:{rport}/v.mp4\",\"ext\":\"mp4\",\"vcodec\":\"avc1\",\"acodec\":\"mp4a\"{headers}}}]}}\\n'\n",
                args_file.display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        let np = std::sync::Arc::new(crate::netpath::NetPath::in_memory());
        np.set(v);
        let ex = Extractor::from_parts(np);
        ex.yt_dlp_path.set(bin.display().to_string()).unwrap();
        (ex, dir)
    }

    #[tokio::test]
    async fn stream_resolution_uses_ipv4_when_the_verdict_says_broken() {
        let (ex, d) = extractor_with_echo_ytdlp(crate::netpath::Ipv6Verdict::Broken, false);
        let s = ex.get_stream_with_yt_dlp("vid123", Some("audio"), None).await.unwrap();
        let args = std::fs::read_to_string(d.path().join("args")).unwrap();
        assert!(args.contains("--force-ipv4"), "{args}");
        assert!(args.contains("--socket-timeout 15"), "{args}");
        assert!(args.contains("watch?v=vid123"), "{args}");
        assert!(s.url.starts_with("http://127.0.0.1:"), "responder URL expected: {}", s.url);
    }

    #[tokio::test]
    async fn stream_resolution_stays_dual_stack_when_ipv6_works() {
        let (ex, d) = extractor_with_echo_ytdlp(crate::netpath::Ipv6Verdict::Works, false);
        let _ = ex.get_stream_with_yt_dlp("vid123", Some("audio"), None).await.unwrap();
        let args = std::fs::read_to_string(d.path().join("args")).unwrap();
        assert!(!args.contains("--force-ipv4"), "{args}");
    }

    /// 2026-11-04: a format WITH http_headers (googlevideo) must be served
    /// through the local proxy — a bare media-element src cannot carry them
    /// and fails to load ("Stream error"). Without headers the URL passes
    /// through unchanged.
    #[tokio::test]
    async fn headered_ytdlp_urls_go_through_the_local_proxy() {
        let (ex, _d) = extractor_with_echo_ytdlp(crate::netpath::Ipv6Verdict::Works, true);
        let s = ex.get_stream_with_yt_dlp("vid123", Some("video"), None).await.unwrap();
        assert!(s.url.starts_with("http://127.0.0.1:"), "expected proxy URL, got {}", s.url);
        assert!(s.url.contains("/stream/"), "{}", s.url);

        let (ex2, _d2) = extractor_with_echo_ytdlp(crate::netpath::Ipv6Verdict::Works, false);
        let s2 = ex2.get_stream_with_yt_dlp("vid123", Some("video"), None).await.unwrap();
        assert!(s2.url.contains("/v.mp4"), "headerless URL stays direct: {}", s2.url);
        assert!(!s2.url.contains("/stream/"), "no proxy without headers: {}", s2.url);
    }

    #[tokio::test]
    async fn search_uses_ipv4_when_the_verdict_says_broken() {
        use std::os::unix::fs::PermissionsExt;
        // Search parses JSON lines, so this fake prints one entry carrying argv.
        let (ex, d) = extractor_with_echo_ytdlp(crate::netpath::Ipv6Verdict::Broken, false);
        let bin = d.path().join("yt-dlp");
        std::fs::write(&bin, "#!/bin/sh\nprintf '{\"id\":\"x\",\"title\":\"%s\"}\\n' \"$*\"\n").unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        let found = ex.search_with_yt_dlp("q").await.unwrap();
        assert!(found[0].title.contains("--force-ipv4"), "{}", found[0].title);
    }

    const PIPED_FIXTURE: &str = include_str!("fixtures/piped_search.json");
    const INVIDIOUS_FIXTURE: &str = include_str!("fixtures/invidious_search.json");
    const YTDLP_FIXTURE: &str = include_str!("fixtures/yt_dlp_search.json");
    /// Live capture 2026-10-23 (ytsearch3:vergecast, --flat-playlist): the
    /// first entries whose `thumbnails` list is present — two signed variants
    /// per video (360×202 ≈ 24 KB, 720×404 ≈ 60–220 KB).
    const LIVE_THUMBNAILS_FIXTURE: &str =
        include_str!("fixtures/yt_search_vergecast_thumbnails.jsonl");

    fn fmt(url: &str, vcodec: Option<&str>, acodec: Option<&str>, abr: Option<f64>, height: Option<u32>) -> YtDlpFormat {
        YtDlpFormat {
            format_id: None,
            available_at: None,
            url: Some(url.into()),
            manifest_url: None,
            http_headers: None,
            ext: Some("mp4".into()),
            vcodec: vcodec.map(|s| s.into()),
            acodec: acodec.map(|s| s.into()),
            abr,
            height,
            protocol: Some("https".into()),
        }
    }

    #[test]
    fn pick_audio_takes_highest_abr_audio_only_format() {
        let formats = vec![
            fmt("https://v/1080", Some("avc1"), Some("mp4a"), None, Some(1080)),
            fmt("https://a/128", Some("none"), Some("mp4a"), Some(128.0), None),
            fmt("https://a/64", Some("none"), Some("opus"), Some(64.0), None),
        ];
        let picked = pick_yt_dlp_format(&formats, true, None).expect("audio");
        assert_eq!(picked.url.as_deref(), Some("https://a/128"));
    }

    /// Round 4: an <audio> element cannot play an HLS manifest — audio picks
    /// must be progressive direct URLs when any exist.
    /// Live end-to-end (run explicitly: cargo test -p echoprism --lib live_ytdlp -- --ignored --nocapture):
    /// real yt-dlp → format pick → stream proxy → HTTP GET through the proxy.
    #[tokio::test]
    #[ignore = "live network: real yt-dlp against YouTube + local proxy"]
    async fn live_ytdlp_audio_resolves_to_loadable_proxy_url() {
        let np = std::sync::Arc::new(crate::netpath::NetPath::in_memory());
        np.set(crate::netpath::Ipv6Verdict::Broken); // this network's IPv6 is broken
        let ex = Extractor::from_parts(np);
        let s = ex
            .get_stream_with_yt_dlp("dQw4w9WgXcQ", Some("audio"), None)
            .await
            .expect("resolve via real yt-dlp");
        println!("resolved url={} format={}", s.url, s.format);
        assert!(s.url.starts_with("http://127.0.0.1:"), "headered URL must go through the proxy: {}", s.url);
        let client = reqwest::Client::new();
        let resp = client
            .get(&s.url)
            .header("Range", "bytes=0-1023")
            .send()
            .await
            .expect("proxy must answer");
        println!("proxy status={} content-range={:?}", resp.status(), resp.headers().get("content-range"));
        assert!(resp.status().is_success() || resp.status() == 206, "proxy must serve bytes: {}", resp.status());
        let body = resp.bytes().await.unwrap();
        assert!(!body.is_empty(), "proxy returned an empty body");

        // Also probe the RAW googlevideo URL directly through reqwest (no
        // stored headers) to see whether redirect-following alone suffices.
        let output = ex.yt_dlp_output(&["--no-playlist".into(), "--no-warnings".into(), "-J".into(), "https://www.youtube.com/watch?v=dQw4w9WgXcQ".into()]).await.unwrap();
        let dump: YtDlpDump = serde_json::from_slice(&output.stdout).unwrap();
        let f = pick_yt_dlp_format(&dump.formats, true, None).unwrap();
        let raw = f.url.clone().unwrap();
        let direct = client.get(&raw).header("Range", "bytes=0-1023").send().await.unwrap();
        println!("direct reqwest status={} (final url host {})", direct.status(), direct.url().host_str().unwrap_or("?"));

        // Full-load probe: no Range, read 512 KiB through the proxy and time it.
        use futures_util::StreamExt;
        let resp2 = client.get(&s.url).send().await.expect("full load through proxy");
        println!("full load status={} content-length={:?} content-range={:?}", resp2.status(), resp2.headers().get("content-length"), resp2.headers().get("content-range"));
        let mut stream = resp2.bytes_stream();
        let mut got = 0usize;
        let start = std::time::Instant::now();
        while let Some(chunk) = stream.next().await {
            got += chunk.unwrap().len();
            if got >= 512 * 1024 { break; }
        }
        println!("read {} bytes in {:?}", got, start.elapsed());
        assert!(got >= 512 * 1024, "proxy must stream a full body progressively, got {got}");
    }

    #[test]
    fn pick_audio_skips_manifests_when_progressive_exists() {
        let mut hls_audio = fmt("https://a/master.m3u8", Some("none"), Some("mp4a"), Some(160.0), None);
        hls_audio.url = None;
        hls_audio.manifest_url = Some("https://a/master.m3u8".into());
        hls_audio.protocol = Some("m3u8_native".into());
        let formats = vec![
            hls_audio,
            fmt("https://a/128.m4a", Some("none"), Some("mp4a"), Some(128.0), None),
        ];
        let picked = pick_yt_dlp_format(&formats, true, None).expect("audio");
        assert_eq!(picked.url.as_deref(), Some("https://a/128.m4a"), "manifest skipped for progressive");
        // Manifest only → fall back to it (better than erroring).
        let only_hls = vec![formats[0].clone()];
        let picked = pick_yt_dlp_format(&only_hls, true, None).expect("fallback");
        assert_eq!(picked.manifest_url.as_deref(), Some("https://a/master.m3u8"));
    }

    /// Round 5 delivery test: the resolver must PROBE candidates through the
    /// proxy and skip one whose upstream 403s. Upstream 403s /bad, 206s
    /// /good; the stub yt-dlp lists the /bad format first (higher abr).
    #[tokio::test]
    async fn resolver_skips_a_403ing_candidate_and_takes_the_next() {
        let upstream = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        tauri::async_runtime::spawn(async move {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            loop {
                let Ok((mut sock, _)) = upstream.accept().await else { break };
                tauri::async_runtime::spawn(async move {
                    let mut buf = vec![0u8; 4096];
                    let n = sock.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]).to_string();
                    let path = req.lines().next().unwrap_or("").split_whitespace().nth(1).unwrap_or("");
                    let (status, body) = if path.contains("bad") {
                        ("403 Forbidden", "nope")
                    } else {
                        ("206 Partial Content", "GOOD")
                    };
                    let resp = format!(
                        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Range: bytes 0-3/100\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = sock.write_all(resp.as_bytes()).await;
                });
            }
        });

        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("yt-dlp");
        std::fs::write(
            &bin,
            format!(
                "#!/bin/sh\nprintf '{{\"formats\":[\n{{\"url\":\"http://127.0.0.1:{port}/bad\",\"ext\":\"m4a\",\"vcodec\":\"none\",\"acodec\":\"mp4a\",\"abr\":160.0,\"protocol\":\"https\",\"http_headers\":{{\"User-Agent\":\"t\"}}}},\n{{\"url\":\"http://127.0.0.1:{port}/good\",\"ext\":\"m4a\",\"vcodec\":\"none\",\"acodec\":\"mp4a\",\"abr\":128.0,\"protocol\":\"https\",\"http_headers\":{{\"User-Agent\":\"t\"}}}}\n]}}'\n"
            ),
        )
        .unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        let np = std::sync::Arc::new(crate::netpath::NetPath::in_memory());
        np.set(crate::netpath::Ipv6Verdict::Works);
        let ex = Extractor::from_parts(np);
        ex.yt_dlp_path.set(bin.display().to_string()).unwrap();

        let s = ex.get_stream_with_yt_dlp("vid", Some("audio"), None).await.expect("a working candidate");
        // The returned URL must be the /good one (via the proxy) and serve bytes.
        let body = reqwest::Client::new()
            .get(&s.url)
            .header("Range", "bytes=0-3")
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert_eq!(&body[..], b"GOOD", "must have fallen through the 403 candidate to the working one: {}", s.url);
    }

    /// Fake upstream for the round-6 tests: `/late*` 403s until `avail_at`
    /// (unix secs) and serves video/mp4 after; `/sb*` is a storyboard sprite
    /// answering 206 image/webp (what i.ytimg.com does). Returns its port.
    async fn spawn_round6_upstream(avail_at: u64) -> (u16, std::sync::Arc<std::sync::atomic::AtomicUsize>) {
        let early = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let early_srv = early.clone();
        let upstream = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        tauri::async_runtime::spawn(async move {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            loop {
                let Ok((mut sock, _)) = upstream.accept().await else { break };
                let early = early_srv.clone();
                tauri::async_runtime::spawn(async move {
                    loop {
                        let mut buf = vec![0u8; 4096];
                        let n = match sock.read(&mut buf).await { Ok(0) | Err(_) => break, Ok(n) => n };
                        let req = String::from_utf8_lossy(&buf[..n]).to_string();
                        let path = req.lines().next().unwrap_or("").split_whitespace().nth(1).unwrap_or("").to_string();
                        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs_f64();
                        let (status, ct, body) = if path.contains("sb") {
                            ("206 Partial Content", "image/webp", "IMG!")
                        } else if now < avail_at as f64 {
                            early.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                            ("403 Forbidden", "text/plain", "")
                        } else {
                            ("206 Partial Content", "video/mp4", "GOOD")
                        };
                        let resp = format!(
                            "HTTP/1.1 {status}\r\nContent-Type: {ct}\r\nContent-Length: {}\r\nContent-Range: bytes 0-3/100\r\nConnection: keep-alive\r\n\r\n{body}",
                            body.len()
                        );
                        if sock.write_all(resp.as_bytes()).await.is_err() { break; }
                    }
                });
            }
        });
        (port, early)
    }

    fn extractor_with_stub_formats(formats_json: &str) -> (Extractor, tempfile::TempDir) {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("yt-dlp");
        std::fs::write(&bin, format!("#!/bin/sh\nprintf '%s\\n' '{{\"formats\":{formats_json}}}'\n")).unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        let np = std::sync::Arc::new(crate::netpath::NetPath::in_memory());
        np.set(crate::netpath::Ipv6Verdict::Works);
        let ex = Extractor::from_parts(np);
        ex.yt_dlp_path.set(bin.display().to_string()).unwrap();
        (ex, dir)
    }

    /// Round 6 root cause (measured live 2026-11-05): yt-dlp -J formats carry
    /// `available_at` (~4 s after extraction) and googlevideo 403s every
    /// request before it. The resolver must WAIT for it, not probe at once
    /// and fall through. Upstream 403s until avail_at; the ONLY real format
    /// is that one, so success proves the wait happened.
    #[tokio::test]
    async fn resolver_waits_for_available_at_before_probing() {
        let avail = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() + 2;
        let (port, early) = spawn_round6_upstream(avail).await;
        let (ex, _d) = extractor_with_stub_formats(&format!(
            "[{{\"format_id\":\"18\",\"url\":\"http://127.0.0.1:{port}/late.mp4\",\"ext\":\"mp4\",\"vcodec\":\"avc1\",\"acodec\":\"mp4a\",\"height\":360,\"protocol\":\"https\",\"available_at\":{avail},\"http_headers\":{{\"User-Agent\":\"t\"}}}}]"
        ));
        let s = ex.get_stream_with_yt_dlp("vid", Some("video"), None).await.expect("must wait for available_at, then succeed");
        let body = reqwest::Client::new().get(&s.url).header("Range", "bytes=0-3").send().await.unwrap().bytes().await.unwrap();
        assert_eq!(&body[..], b"GOOD", "{}", s.url);
        // The PROBE itself must wait: a premature request costs a 403 plus a
        // full yt-dlp re-extraction in the proxy's refresh path.
        assert_eq!(early.load(std::sync::atomic::Ordering::SeqCst), 0, "no request may reach upstream before available_at");
    }

    /// Round 6 masking bug (measured live): with every real format 403ing, the
    /// resolver fell through to a storyboard 'format' (protocol mhtml,
    /// image/webp) and handed WebKit an IMAGE (MediaError 4, 'Stream error').
    /// A storyboard must never be returned as a stream — fail honestly.
    #[tokio::test]
    async fn resolver_never_returns_a_storyboard_image() {
        let far = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() + 3600;
        let (port, _early) = spawn_round6_upstream(far).await;
        let (ex, _d) = extractor_with_stub_formats(&format!(
            "[{{\"format_id\":\"18\",\"url\":\"http://127.0.0.1:{port}/late.mp4\",\"ext\":\"mp4\",\"vcodec\":\"avc1\",\"acodec\":\"mp4a\",\"protocol\":\"https\",\"http_headers\":{{\"User-Agent\":\"t\"}}}},\
             {{\"format_id\":\"sb0\",\"url\":\"http://127.0.0.1:{port}/sb/M0.jpg\",\"ext\":\"mhtml\",\"vcodec\":\"none\",\"acodec\":\"none\",\"protocol\":\"mhtml\",\"http_headers\":{{\"User-Agent\":\"t\"}}}},\
             {{\"format_id\":\"x\",\"url\":\"http://127.0.0.1:{port}/sb/disguised.mp4\",\"ext\":\"mp4\",\"vcodec\":\"avc1\",\"acodec\":\"mp4a\",\"protocol\":\"https\",\"http_headers\":{{\"User-Agent\":\"t\"}}}}]"
        ));
        let r = ex.get_stream_with_yt_dlp("vid", Some("video"), None).await;
        assert!(r.is_err(), "an image must never be served as a stream: {:?}", r.map(|s| s.url));
    }

    /// Round 6: the proxy refresh must keep the format the stream started on
    /// (top-ranked 'a' differs from the playing 'b' here) and must hand back
    /// the fresh URL only once its available_at has passed.
    #[tokio::test]
    async fn refresh_keeps_the_playing_format_and_waits_for_available_at() {
        let avail = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs_f64() + 2.0;
        let (ex, _d) = extractor_with_stub_formats(&format!(
            "[{{\"format_id\":\"a\",\"url\":\"http://x/a-144\",\"vcodec\":\"avc1\",\"acodec\":\"mp4a\",\"height\":144,\"protocol\":\"https\"}},\
             {{\"format_id\":\"b\",\"url\":\"http://x/b-360\",\"vcodec\":\"avc1\",\"acodec\":\"mp4a\",\"height\":360,\"protocol\":\"https\",\"available_at\":{avail}}}]"
        ));
        let refresh = ex.refresh_ytdlp_url("vid", false, Some("b".into())).unwrap();
        let (url, _h) = refresh().await.expect("refresh result");
        let returned_at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs_f64();
        assert_eq!(url, "http://x/b-360", "refresh must keep the playing format");
        assert!(returned_at >= avail, "must not return before available_at (returned {:.2}s early)", avail - returned_at);
    }

    /// LIVE (network + real yt-dlp; run with --ignored): the video that
    /// failed on 2026-11-05 must resolve to real media through the proxy and
    /// stream (2 MB video / 256 KB audio), for both video and audio-only.
    #[tokio::test]
    #[ignore]
    async fn live_round6_youtube_resolves_to_streamable_media() {
        let np = std::sync::Arc::new(crate::netpath::NetPath::in_memory());
        np.set(crate::netpath::Ipv6Verdict::Broken);
        let ex = Extractor::from_parts(np);
        ex.yt_dlp_path.set("yt-dlp".into()).unwrap();
        for fmt_kind in ["video", "audio"] {
            let s = ex.get_stream_with_yt_dlp("tuN5h65fhBk", Some(fmt_kind), None).await.expect("resolve");
            let r = reqwest::Client::new().get(&s.url).header("Range", "bytes=0-").send().await.unwrap();
            let ct = r.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
            assert_eq!(r.status(), 206, "{fmt_kind}: {}", s.url);
            assert!(ct.starts_with("video/") || ct.starts_with("audio/"), "{fmt_kind}: content-type {ct}");
            // googlevideo throttles audio-only to ~2x playback rate (measured:
            // 32 KB/s for 129 kbps, ttfb 77 ms), so read less audio than video.
            let want = if fmt_kind == "audio" { 256_000 } else { 2_000_000 };
            let mut got = 0usize;
            let mut stream = r.bytes_stream();
            while let Some(chunk) = futures_util::StreamExt::next(&mut stream).await {
                got += chunk.unwrap().len();
                if got >= want { break; }
            }
            assert!(got >= want, "{fmt_kind}: only {got} bytes");
            eprintln!("LIVE {fmt_kind}: 206 {ct}, streamed {got} bytes via {}", s.url);
        }
    }

    /// LIVE (network + real yt-dlp; run with --ignored). Round 6 Task 2
    /// (echoprism-audio-only-seek): the owner reports seeking in audio-only
    /// does nothing. A webview media element seeks by re-requesting with
    /// `Range: bytes=N-`; through the proxy the upstream must answer 206 with
    /// a Content-Range starting at N. Probe the total size with bytes=0-,
    /// then request the second half of the audio stream.
    #[tokio::test]
    #[ignore]
    async fn live_round6_audio_only_mid_stream_range_seek() {
        let np = std::sync::Arc::new(crate::netpath::NetPath::in_memory());
        np.set(crate::netpath::Ipv6Verdict::Broken);
        let ex = Extractor::from_parts(np);
        ex.yt_dlp_path.set("yt-dlp".into()).unwrap();
        let s = ex.get_stream_with_yt_dlp("tuN5h65fhBk", Some("audio"), None).await.expect("resolve audio");
        let client = reqwest::Client::new();
        let head = client.get(&s.url).header("Range", "bytes=0-").send().await.unwrap();
        assert_eq!(head.status(), 206, "probe: {}", s.url);
        let cr = head
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let total: u64 = cr
            .rsplit('/')
            .next()
            .unwrap_or("0")
            .parse()
            .expect("total size after / in Content-Range");
        assert!(total > 128 * 1024, "audio stream implausibly small: {total}");
        drop(head);

        let start = total / 2;
        let r = client
            .get(&s.url)
            .header("Range", format!("bytes={start}-"))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 206, "mid-stream range must be honoured: {}", s.url);
        let cr2 = r
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        assert!(
            cr2.starts_with(&format!("bytes {start}-")),
            "Content-Range must start at the requested byte, got {cr2}"
        );
        let mut got = 0usize;
        let mut stream = r.bytes_stream();
        while let Some(chunk) = futures_util::StreamExt::next(&mut stream).await {
            got += chunk.unwrap().len();
            if got >= 64 * 1024 {
                break;
            }
        }
        assert!(got >= 64 * 1024, "only {got} bytes from the mid-stream range");
        eprintln!("LIVE audio mid-stream seek: total={total} start={start} cr={cr2} got={got} bytes");
    }

    /// Round 9 (echoprism-audio-only-large): the owner's stall — audio-only seeks
    /// to a LARGE offset hang "minutes", small jumps work. Discriminate the
    /// upstream from the frontend: a 90%-offset Range with timing, then a second
    /// Range after a 10 s wall-clock gap (the URL-expiry window; the direct-URL
    /// path here deliberately bypasses the proxy's refresh). A stall reproduces
    /// as this test exceeding its own bound. `--ignored` live: network + yt-dlp.
    #[tokio::test]
    #[ignore]
    async fn live_round9_audio_only_large_offset_seek_with_timing() {
        let np = std::sync::Arc::new(crate::netpath::NetPath::in_memory());
        np.set(crate::netpath::Ipv6Verdict::Broken);
        let ex = Extractor::from_parts(np);
        ex.yt_dlp_path.set("yt-dlp".into()).unwrap();
        let s = ex
            .get_stream_with_yt_dlp("tuN5h65fhBk", Some("audio"), None)
            .await
            .expect("resolve audio");
        let client = reqwest::Client::new();
        let head = client
            .get(&s.url)
            .header("Range", "bytes=0-")
            .send()
            .await
            .unwrap();
        assert_eq!(head.status(), 206, "probe: {}", s.url);
        let cr = head
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let total: u64 = cr
            .rsplit('/')
            .next()
            .unwrap_or("0")
            .parse()
            .expect("total size after / in Content-Range");
        drop(head);

        let far = total * 9 / 10;
        let t0 = std::time::Instant::now();
        let r = client
            .get(&s.url)
            .header("Range", format!("bytes={far}-"))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 206, "90%-offset range must be honoured: {}", s.url);
        let cr_far = r
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        assert!(
            cr_far.starts_with(&format!("bytes {far}-")),
            "Content-Range must start at the 90% offset, got {cr_far}"
        );
        let first = t0.elapsed();
        drop(r);

        // Second jump after a wall-clock gap: minutes into listening, the
        // element re-requests — if the URL has expired by then, the element
        // sees a 403 on a plain seek (the proxy's refresh only covers URLs it
        // serves, not this direct path).
        std::thread::sleep(std::time::Duration::from_secs(10));
        let back = total / 4;
        let t1 = std::time::Instant::now();
        let r2 = client
            .get(&s.url)
            .header("Range", format!("bytes={back}-"))
            .send()
            .await
            .unwrap();
        let status2 = r2.status();
        let second = t1.elapsed();
        eprintln!(
            "LIVE round9 large-offset: total={total} far={far} first={first:?} status2={status2} second={second:?} (direct URL, no proxy refresh)"
        );
        assert!(
            first < std::time::Duration::from_secs(30),
            "90%-offset Range took {first:?} — the upstream stall class"
        );
        assert_eq!(
            status2, 206,
            "second seek after 10s must still serve (got {status2}) — a 403 means the expiry window is shorter than listening gaps and plain seeks see it"
        );
    }

    #[test]
    fn rank_excludes_mhtml_storyboards() {
        let mut sb = fmt("https://i.ytimg.com/sb/x/M0.jpg", Some("none"), Some("none"), None, Some(45));
        sb.protocol = Some("mhtml".into());
        let real = fmt("https://v/360", Some("avc1"), Some("mp4a"), None, Some(360));
        for want_audio in [true, false] {
            let ranked = rank_yt_dlp_formats(&[sb.clone(), real.clone()], want_audio);
            assert!(ranked.iter().all(|f| f.protocol.as_deref() != Some("mhtml")), "audio={want_audio}: {:?}", ranked.iter().map(|f| f.url.clone()).collect::<Vec<_>>());
        }
    }

    #[test]
    fn pick_video_prefers_muxed_progressive_over_hls_manifest() {
        let mut hls = fmt("https://v/hls", Some("avc1"), Some("mp4a"), None, Some(1080));
        hls.url = None;
        hls.manifest_url = Some("https://v/master.m3u8".into());
        hls.protocol = Some("m3u8_native".into());
        let formats = vec![hls, fmt("https://v/720", Some("avc1"), Some("mp4a"), None, Some(720))];
        let picked = pick_yt_dlp_format(&formats, false, None).expect("video");
        assert_eq!(picked.url.as_deref(), Some("https://v/720"), "muxed progressive beats HLS");
        // No muxed format → the HLS manifest.
        let only_hls = vec![formats[0].clone()];
        let picked = pick_yt_dlp_format(&only_hls, false, None).expect("manifest");
        assert_eq!(picked.manifest_url.as_deref(), Some("https://v/master.m3u8"));
    }

    /// Piped search items arrive wrapped in {"items": [...]} and carry the
    /// video id inside a /watch?v= URL rather than a dedicated field.
    /// Fixture: real capture from pipedapi.ducks.party, 2026-10-20.
    #[test]
    fn piped_search_fixture_normalizes_to_video_info() {
        let videos = parse_piped_search(PIPED_FIXTURE).expect("parse piped fixture");
        assert!(!videos.is_empty());
        let v = &videos[0];
        assert_eq!(v.id, "CBVODIUnPwc");
        assert_eq!(
            v.title,
            "Why your favorite creator is building an app | The Vergecast"
        );
        assert_eq!(v.channel.as_deref(), Some("The Verge"));
        assert_eq!(
            v.channel_id.as_deref(),
            Some("UCddiUEpeqJcYeBxX1IVBKvQ"),
            "the UC id from /channel/ keys channels identically across backends"
        );
        assert_eq!(v.duration, Some(2487));
        assert_eq!(v.view_count, Some(1282));
        assert!(
            v.thumbnail
                .as_deref()
                .unwrap_or("")
                .starts_with("https://piped-proxy.ducks.party/")
        );
    }

    /// yt-dlp --flat-playlist entries carry id/duration/channel directly.
    /// Fixture: real capture, ytsearch3:vergecast, yt-dlp 2026.08.19.
    #[test]
    fn yt_dlp_search_fixture_normalizes_to_video_info() {
        let videos = parse_yt_dlp_search(YTDLP_FIXTURE).expect("parse yt-dlp fixture");
        assert_eq!(videos.len(), 3);
        let v = &videos[0];
        assert_eq!(v.id, "z00Lhm3CqAM");
        assert_eq!(
            v.title,
            "Apple's HomeView has an app problem | The Vergecast"
        );
        assert_eq!(v.channel.as_deref(), Some("The Verge"));
        assert_eq!(v.duration, Some(5912));
        assert_eq!(v.view_count, Some(54497));
    }

    /// --flat-playlist carries no `thumbnail`, only a `thumbnails` list; the
    /// parser ignored it, so every yt-dlp result was stored without an image
    /// (observed live 2026-10-22: 0 of 34 episodes had a thumbnail_url).
    /// 2h SUPERSEDES the widest-variant policy this test used to pin: the
    /// card grid pulled 3–11 MB per search (the 720 signed variant measures
    /// 60–220 KB vs the 360's 24 KB, same list) — that IS the "thumbnails
    /// load slowly" report. Card-appropriate = smallest width ≥ 300.
    #[test]
    fn yt_dlp_search_picks_the_card_appropriate_thumbnail() {
        // Live capture (fixtures/yt_search_vergecast_thumbnails.jsonl, taken
        // 2026-10-23): every entry carries the 360 and 720 signed variants.
        let videos =
            parse_yt_dlp_search(LIVE_THUMBNAILS_FIXTURE).expect("parse live fixture");
        let thumb = videos[0].thumbnail.as_deref().expect("thumbnail from the thumbnails list");
        assert!(
            thumb.contains("COgCEM"),
            "expected the 360-wide variant (24 KB), got the 720-wide one: {thumb}"
        );

        // Edges of the selection rule (synthetic; widths from the real list).
        // Prefer the smallest ≥ 300; only larger exist → the smallest of them.
        let both = r#"{"id":"a","title":"t","thumbnails":[{"url":"https://i/big.jpg","width":720},{"url":"https://i/small.jpg","width":360}]}"#;
        let v = parse_yt_dlp_search(both).expect("parse");
        assert_eq!(v[0].thumbnail.as_deref(), Some("https://i/small.jpg"));

        let only_big = r#"{"id":"a","title":"t","thumbnails":[{"url":"https://i/x.jpg","width":1280},{"url":"https://i/y.jpg","width":720}]}"#;
        let v = parse_yt_dlp_search(only_big).expect("parse");
        assert_eq!(v[0].thumbnail.as_deref(), Some("https://i/y.jpg"));

        // Nothing ≥ 300 → the largest below (a small image beats none).
        let only_small = r#"{"id":"a","title":"t","thumbnails":[{"url":"https://i/s.jpg","width":120},{"url":"https://i/m.jpg","width":200}]}"#;
        let v = parse_yt_dlp_search(only_small).expect("parse");
        assert_eq!(v[0].thumbnail.as_deref(), Some("https://i/m.jpg"));

        let none = parse_yt_dlp_search(r#"{"id":"b","title":"t"}"#).expect("parse");
        assert_eq!(none[0].thumbnail, None);
    }

    /// DOC-DERIVED fixture, deliberately not a live capture: the public
    /// Invidious API is disabled ecosystem-wide (official registry marks every
    /// instance api:false; verified 2026-10-20), so only user-added private
    /// instances can serve this shape. It follows the documented
    /// /api/v1/search response.
    #[test]
    fn invidious_search_fixture_normalizes_to_video_info() {
        let videos =
            parse_invidious_search(INVIDIOUS_FIXTURE).expect("parse invidious fixture");
        assert_eq!(videos.len(), 2);
        assert_eq!(videos[0].id, "dQw4w9WgXcQ");
        assert_eq!(videos[0].channel.as_deref(), Some("The Verge"));
        assert_eq!(videos[0].duration, Some(5912));
        assert_eq!(videos[1].id, "aqz-KE-bpKQ");
    }

    /// Discriminant: truncated/malformed payloads must fail parsing, never
    /// silently yield partial or empty-but-Ok results.
    #[test]
    fn malformed_search_payload_fails_not_partial() {
        let truncated = &PIPED_FIXTURE[..PIPED_FIXTURE.len() / 2];
        assert!(parse_piped_search(truncated).is_err());
        assert!(parse_invidious_search("{\"title\":").is_err());
        assert!(parse_yt_dlp_search("[{\"id\":").is_err());
    }

    // ---- LIVE smoke (network-dependent; #[ignore] keeps CI offline) --------
    // Run explicitly: cargo test --lib -- --ignored

    #[tokio::test]
    #[ignore = "live network: public Piped instance"]
    async fn live_piped_search_returns_parseable_videos() {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .expect("client");
        let resp = client
            .get("https://pipedapi.ducks.party/search")
            .query(&[("q", "vergecast"), ("filter", "videos")])
            .send()
            .await
            .expect("live request");
        assert!(resp.status().is_success(), "status {}", resp.status());
        let body = resp.text().await.expect("body");
        let videos = parse_piped_search(&body).expect("parse live response");
        assert!(!videos.is_empty(), "live search returned no videos");
        assert!(
            videos.iter().all(|v| !v.id.is_empty() && !v.title.is_empty()),
            "every result needs an id and a title"
        );
        println!(
            "LIVE piped: {} results; first: {} ({})",
            videos.len(),
            videos[0].title,
            videos[0].id
        );
    }

    #[tokio::test]
    #[ignore = "live network: local yt-dlp binary"]
    async fn live_yt_dlp_search_returns_parseable_videos() {
        let mut bin = None;
        for c in ["yt-dlp", "/opt/homebrew/bin/yt-dlp"] {
            if let Ok(o) = tokio::process::Command::new(c).arg("--version").output().await {
                if o.status.success() {
                    bin = Some(c.to_string());
                    break;
                }
            }
        }
        let bin = bin.expect("yt-dlp installed for live smoke");
        let out = tokio::process::Command::new(&bin)
            .args(["--dump-json", "--flat-playlist", "--no-warnings", "ytsearch5:vergecast"])
            .output()
            .await
            .expect("run yt-dlp");
        assert!(
            out.status.success(),
            "yt-dlp failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        let videos = parse_yt_dlp_search(&String::from_utf8_lossy(&out.stdout)).expect("parse");
        assert!(!videos.is_empty(), "live yt-dlp search returned no videos");
        println!(
            "LIVE yt-dlp: {} results; first: {} ({})",
            videos.len(),
            videos[0].title,
            videos[0].id
        );
    }

    // ---- 1e: the live stream path against RECORDED real responses ----
    // The 1b deferral ("live resolution deferred to Phase 5's smoke") closed
    // by recon: get_stream_from_instance built the INVIDIOUS /api/v1/videos/
    // {id}/streams URL for every instance type, but the seeded default
    // instance is PIPED, whose streams live at /streams/{id} with a
    // different response shape — every instance attempt 404'd and silently
    // fell through to yt-dlp (measured against the live instance).

    const PIPED_STREAMS_FIXTURE: &str = include_str!("fixtures/piped_streams.json");

    /// Phase E: the storyboard parser picks the most detailed level at or
    /// below 480px — the committed fixture (live capture) carries 80×45 and
    /// 160×90; the parser must take 160×90 with its 5 pages.
    #[test]
    fn storyboard_parse_prefers_the_detailed_level() {
        let spec = parse_storyboard(PIPED_STREAMS_FIXTURE).expect("storyboard from the fixture");
        assert_eq!(spec.frame_width, 160);
        assert_eq!(spec.frame_height, 90);
        assert_eq!(spec.urls.len(), 5);
        assert_eq!(spec.frames_per_page_x, 5);
        assert_eq!(spec.frames_per_page_y, 5);
        assert!(spec.total_count > 0);
        assert!(spec.duration_per_frame_ms > 0);
    }

    /// No previewFrames (an instance without them, or a bot-blocked
    /// response) → None: the caller keeps the static thumbnail.
    #[test]
    fn storyboard_parse_returns_none_without_frames() {
        assert!(parse_storyboard(r#"{"title":"x"}"#).is_none());
        assert!(parse_storyboard(r#"{"previewFrames":[]}"#).is_none());
        assert!(parse_storyboard("not json").is_none());
    }

    /// Phase E (the yt-dlp fallback): a -J dump's sb formats parse into the
    /// spec — the largest frame ≤480px (sb0, 320×180) with its pages as
    /// urls. DOC-DERIVED fixture (see the parser doc comment): the live
    /// capture was bot-blocked today; re-verify when it lifts.
    #[test]
    fn yt_dlp_storyboard_parse_prefers_the_largest_small_frame() {
        const FIXTURE: &str = include_str!("fixtures/yt_dlp_storyboard.json");
        let spec = parse_yt_dlp_storyboard(FIXTURE).expect("storyboard from the LIVE fixture");
        assert_eq!(spec.frame_width, 320);
        assert_eq!(spec.frame_height, 180);
        assert_eq!(spec.frames_per_page_x, 3);
        assert_eq!(spec.frames_per_page_y, 3);
        assert_eq!(spec.urls.len(), 45, "one url per sheet page");
        assert!(spec.urls[0].starts_with("https://i.ytimg.com/sb/"));
        // fps ~0.1 → ~10 s per frame (storyboards are sparse by design).
        assert!(spec.duration_per_frame_ms >= 1000);
    }

    #[test]
    fn yt_dlp_storyboard_parse_returns_none_without_sb_formats() {
        assert!(parse_yt_dlp_storyboard(r#"{"formats":[{"format_id":"22","width":1280}]}"#).is_none());
        assert!(parse_yt_dlp_storyboard("not json").is_none());
    }

    /// The recorded real body must deserialize permissively and select the
    /// highest-ranked video stream.
    #[test]
    fn piped_streams_fixture_deserializes_and_selects_best_video() {
        let streams = parse_piped_streams(PIPED_STREAMS_FIXTURE)
            .expect("parse recorded Piped /streams body");
        assert_eq!(streams.video_streams.len(), 3, "real capture: 3 video streams");
        assert_eq!(streams.audio_streams.len(), 0, "real capture: audio PO-token gated");
        let picked = select_piped_stream(streams, Some("video"), None).expect("a video stream");
        assert_eq!(picked.quality, "360p", "highest numeric quality wins");
        assert!(picked.url.starts_with("https://"));
    }

    #[test]
    fn piped_streams_quality_filter_picks_named_tier() {
        let streams = parse_piped_streams(PIPED_STREAMS_FIXTURE).expect("parse");
        // "HLS" matches exactly one tier ("LBRY" would match two — the
        // filter is a substring, same semantics as the invidious branch).
        let picked = select_piped_stream(streams, None, Some("HLS")).expect("HLS tier");
        assert_eq!(picked.quality, "LBRY HLS");
    }

    /// REVERSED 2026-11-03 (owner live-run round 2): the old expectation was
    /// that audio selection on the PO-token-gated fixture ERRORS and falls
    /// through to yt-dlp — but yt-dlp returns a direct googlevideo URL with no
    /// headers, which the webview media element cannot load ("Stream error"
    /// on every audio-only toggle). Piped's combined video streams carry an
    /// audio track and play in an <audio> element, so audio now falls back to
    /// the best non-video-only mp4 video stream.
    #[test]
    fn piped_streams_audio_falls_back_to_best_combined_mp4() {
        let streams = parse_piped_streams(PIPED_STREAMS_FIXTURE).expect("parse");
        assert_eq!(streams.audio_streams.len(), 0, "premise: real capture is audio-gated");
        let picked = select_piped_stream(streams, Some("audio"), None).expect("combined fallback");
        assert_eq!(picked.quality, "360p", "highest-ranked combined stream wins");
        assert_eq!(picked.format, "MPEG_4", "an mp4, not an HLS manifest");
        assert!(picked.url.contains("piped-proxy"), "a proxy URL the media element can load: {}", picked.url);
    }

    #[test]
    fn piped_streams_audio_prefers_real_audio_streams_when_present() {
        let streams = parse_piped_streams(
            r#"{"audioStreams":[{"url":"https://proxy.example/audio-128.opus","format":"M4A","quality":"128 kbps"}],
                "videoStreams":[{"url":"https://proxy.example/v-720.mp4","format":"MPEG_4","quality":"720p"}]}"#,
        )
        .expect("parse");
        let picked = select_piped_stream(streams, Some("audio"), None).expect("audio stream");
        assert!(picked.url.contains("audio-128"), "audioStreams win when published: {}", picked.url);
    }

    #[test]
    fn piped_streams_audio_fallback_skips_video_only_and_hls() {
        // Only a video-only stream and an HLS manifest carry no usable audio
        // for an <audio> element → error (yt-dlp last resort stays).
        let streams = parse_piped_streams(
            r#"{"audioStreams":[],
                "videoStreams":[
                  {"url":"https://x/vonly.mp4","format":"MPEG_4","quality":"720p","videoOnly":true},
                  {"url":"https://x/master.m3u8","format":"HLS","quality":"1080p"}]}"#,
        )
        .expect("parse");
        assert!(select_piped_stream(streams, Some("audio"), None).is_err());
    }

    /// Truncated/malformed body must fail the parse, not yield empty-ok.
    #[test]
    fn malformed_piped_streams_body_fails() {
        assert!(parse_piped_streams("{\"audioStreams\": [").is_err());
    }

    /// Ranking must be by numeric quality, not list order: the recorded
    /// fixture's best tier happens to sit last, where max_by_key's
    /// last-maximum tie-break would mask a dead ranking.
    #[test]
    fn piped_stream_selection_ranks_by_numeric_quality() {
        let mk = |url: &str, q: &str| PipedStreamEntry {
            url: url.into(),
            format: Some("MP4".into()),
            quality: Some(q.into()),
            itag: Some(18),
            mime_type: None,
            video_only: None,
        };
        let streams = PipedStreams {
            audio_streams: vec![],
            video_streams: vec![mk("https://a", "360p"), mk("https://b", "1080p"), mk("https://c", "720p")],
        };
        let picked = select_piped_stream(streams, Some("video"), None).expect("best stream");
        assert_eq!(picked.quality, "1080p", "must rank by numeric quality, not list order");
    }

    /// LIVE smoke for the 1b deferral: resolve a real stream end to end
    /// (Piped instance branch first, yt-dlp fallback behind it). The seeded
    /// default instance is Piped — this is the path the 1e recon found
    /// silently dead (Invidious URL on a Piped host).
    #[tokio::test]
    #[ignore = "live network: Piped instance + local yt-dlp"]
    async fn live_stream_resolution_serves_a_playable_url() {
        use crate::types::{Instance, InstanceHealth, InstanceType};
        use chrono::Utc;

        let extractor = Extractor {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("http client"),
            yt_dlp_path: std::sync::OnceLock::new(),
            netpath: std::sync::Arc::new(crate::netpath::NetPath::in_memory()),
        };
        let now = Utc::now().to_rfc3339();
        let piped = Instance {
            id: "live-piped".into(),
            url: "https://pipedapi.ducks.party".into(),
            instance_type: InstanceType::Piped,
            health: InstanceHealth::Healthy,
            latency_ms: Some(50),
            last_checked: None,
            auto_failover: true,
            supports_sabr: false,
            supports_age_restricted: false,
            region: None,
            country: None,
            pinned: false,
            created_at: now.clone(),
            updated_at: now,
        };
        let stream = extractor
            .resolve_stream("dQw4w9WgXcQ", None, None, &[piped])
            .await
            .expect("live stream resolution");
        println!("LIVE stream: {} ({}, {})", stream.url, stream.format, stream.quality);
        assert!(
            stream.url.starts_with("http"),
            "resolved stream must be a playable http(s) URL"
        );
    }

    // ---- 1d Phase 4 LIVE smoke (network-dependent; #[ignore] keeps CI offline) ----
    // Run explicitly: cargo test --lib -- --ignored
    //
    // The full 1d chain on REAL data for the three test shows: iTunes search
    // → subscribe (feed fetch + episode rows), yt-dlp search → stored video
    // rows, then the matcher's REAL input queries (Phase 1) + the calibrated
    // Scorer (Phase 2) pairing them. Prints every pairing as the receipt.

    #[tokio::test]
    #[ignore = "live network: iTunes, three podcast feeds, local yt-dlp"]
    async fn live_three_show_smart_link_smoke() {
        use crate::db::migrations;
        use crate::db::queries as q;
        use crate::matcher::{MatchingConfig, Scorer};
        use crate::podcast::PodcastManager;
        use crate::types::{DateTimeUtc, EpisodeLink, MatchSource};
        use sqlx::query;
        use sqlx::sqlite::SqlitePoolOptions;

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect in-memory sqlite");
        migrations::run(&pool).await.expect("run migrations");
        query("INSERT OR IGNORE INTO users (id) VALUES ('current-user')")
            .execute(&pool)
            .await
            .expect("insert user");

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .expect("http client");

        for (term, name_fragment) in [
            ("vergecast", "Vergecast"),
            ("some more news", "Some More News"),
            ("power user", "Power User"),
        ] {
            let results = PodcastManager::search_itunes_with(&client, term)
                .await
                .expect("live iTunes search");
            let hit = results
                .iter()
                .find(|r| r.title.to_lowercase().contains(&name_fragment.to_lowercase()))
                .unwrap_or_else(|| {
                    panic!(
                        "iTunes must return {name_fragment}; got {:?}",
                        results.iter().map(|r| r.title.clone()).collect::<Vec<_>>()
                    )
                });
            let feed = PodcastManager::fetch_feed_with(&client, &hit.feed_url)
                .await
                .expect("live feed fetch");
            let (_, stored) =
                q::upsert_podcast_subscription(&pool, &hit.feed_url, &hit.title, &feed)
                    .await
                    .expect("subscribe");
            println!(
                "SUB [{term}] '{}' -> {} episodes from {}",
                hit.title, stored, hit.feed_url
            );

            let mut bin = None;
            for c in ["yt-dlp", "/opt/homebrew/bin/yt-dlp"] {
                if let Ok(o) = tokio::process::Command::new(c).arg("--version").output().await {
                    if o.status.success() {
                        bin = Some(c.to_string());
                        break;
                    }
                }
            }
            let bin = bin.expect("yt-dlp installed for live smoke");
            let out = tokio::process::Command::new(&bin)
                .args([
                    "--dump-json",
                    "--flat-playlist",
                    "--no-warnings",
                    &format!("ytsearch5:{term}"),
                ])
                .output()
                .await
                .expect("run yt-dlp");
            assert!(
                out.status.success(),
                "yt-dlp failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            let videos = parse_yt_dlp_search(&String::from_utf8_lossy(&out.stdout)).expect("parse yt-dlp");
            let new_rows = q::upsert_video_results(&pool, &videos)
                .await
                .expect("store video results");
            println!("VID [{term}] {} results, {} new rows", videos.len(), new_rows);
        }

        let podcasts = q::get_unmatched_podcasts(&pool).await.expect("matcher podcast input");
        let candidates = q::get_youtube_videos(&pool).await.expect("matcher video input");
        println!(
            "MATCHER INPUT: {} podcast rows, {} video rows",
            podcasts.len(),
            candidates.len()
        );

        let scorer = Scorer::new();
        let config = MatchingConfig::default();
        let mut links = 0usize;
        for pod in &podcasts {
            // Offline extraction has no DB, so no linked-channel set — empty.
            if let Some(pairing) = scorer.best_pairing(pod, &candidates, &config, &std::collections::HashSet::new()) {
                let video = candidates
                    .iter()
                    .find(|v| v.id == pairing.video_id)
                    .expect("paired video present");
                println!(
                    "PAIR {:.3} (title {:.3})\n  POD: {}\n  VID: {}",
                    pairing.confidence, pairing.title_similarity, pod.title, video.title
                );
                let now = DateTimeUtc::from(chrono::Utc::now());
                q::insert_episode_link(
                    &pool,
                    &EpisodeLink {
                        id: uuid::Uuid::new_v4().to_string(),
                        podcast_guid: pod.guid.clone(),
                        youtube_video_id: pairing.video_id.clone(),
                        confidence: pairing.confidence,
                        matched_at: now,
                        matched_by: MatchSource::Auto,
                        title_similarity: Some(pairing.title_similarity),
                        date_diff_days: pairing.date_diff_days,
                        duration_diff_seconds: pairing.duration_diff_seconds,
                        user_confirmed: false,
                        created_at: now,
                        updated_at: now,
                    },
                )
                .await
                .expect("insert link");
                links += 1;
            }
        }
        println!("PAIRED {links} of {} podcast rows", podcasts.len());

        // D7 data-shape receipts (the chain resolution itself is covered by
        // src/__tests__/d7-play-mode-chain.test.tsx): which real titles carry
        // the per-title rule shapes the owner case relies on.
        let emn = podcasts
            .iter()
            .filter(|p| p.title.starts_with("Even More News: "))
            .count();
        let rule_shaped = candidates
            .iter()
            .filter(|v| v.title.contains("SOME MORE NEWS") || v.title.contains(" | The Vergecast"))
            .count();
        println!(
            "D7 SHAPES: {emn} 'Even More News: ' podcast titles; {rule_shaped} rule-matching video titles"
        );

        assert!(
            links >= 1,
            "matcher must pair at least one real episode (Vergecast titles are near-identical)"
        );
        // Linked guids must drop out of the matcher input (Phase 1 exclusion, live).
        let pods_after = q::get_unmatched_podcasts(&pool)
            .await
            .expect("matcher input after");
        assert_eq!(
            pods_after.len() + links,
            podcasts.len(),
            "linked guids must be excluded from the next matcher run"
        );
        pool.close().await;
    }
}
