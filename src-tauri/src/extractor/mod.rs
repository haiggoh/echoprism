//! Video extraction using yt-dlp and Invidious/Piped APIs

use crate::types::*;
use tauri::AppHandle;
use serde::{Deserialize, Serialize};

pub struct Extractor {
    client: reqwest::Client,
    /// Resolved once on first use; the extractor lives in `Arc` managed state,
    /// so memoization uses `OnceLock` rather than `&mut`.
    yt_dlp_path: std::sync::OnceLock<String>,
}

impl Extractor {
    /// The AppHandle parameter predates 1b: instance selection moved to the
    /// call sites (search/stream commands pass ordered candidates), so the
    /// extractor no longer reads any managed state. Kept in the signature to
    /// avoid touching the managed-state construction order in lib.rs.
    pub fn new(_app_handle: AppHandle) -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("Mozilla/5.0 (compatible; EchoPrism/0.1)")
                .build()
                .expect("Failed to create HTTP client"),
            yt_dlp_path: std::sync::OnceLock::new(),
        }
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
        let yt_dlp = self.find_yt_dlp().await?;
        let target = format!("ytsearch20:{}", query);
        let output = tokio::process::Command::new(&yt_dlp)
            .args([
                "--dump-json",
                "--flat-playlist",
                "--no-warnings",
                &target,
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("yt-dlp search failed: {}", stderr));
        }
        parse_yt_dlp_search(&String::from_utf8_lossy(&output.stdout))
    }

    /// Resolve a playable stream URL: try each candidate instance in order,
    /// then fall back to the local yt-dlp binary — the same failover policy
    /// as search.
    pub async fn resolve_stream(&self, video_id: &str, format: Option<&str>, quality: Option<&str>, candidates: &[Instance]) -> Result<StreamUrl, String> {
        for instance in candidates {
            if let Ok(stream) = self.get_stream_from_instance(video_id, instance, format, quality).await {
                return Ok(stream);
            }
        }
        self.get_stream_with_yt_dlp(video_id, format, quality).await
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
            InstanceType::Piped => self.get_stream_from_piped(video_id, instance, format).await,
            InstanceType::Invidious => {
                self.get_stream_from_invidious(video_id, instance, format, quality).await
            }
        }
    }

    async fn get_stream_from_piped(&self, video_id: &str, instance: &Instance, format: Option<&str>) -> Result<StreamUrl, String> {
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
        select_piped_stream(parse_piped_streams(&body)?, format, None)
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
    
    async fn get_stream_with_yt_dlp(&self, video_id: &str, format: Option<&str>, quality: Option<&str>) -> Result<StreamUrl, String> {
        let _yt_dlp = self.find_yt_dlp().await?;

        let mut args: Vec<String> = vec!["-g".to_string(), "--no-playlist".to_string(), "--no-warnings".to_string()];
        if let Some(f) = format { args.extend(["-f".to_string(), f.to_string()]); }
        if let Some(q) = quality {
            let quality_arg = format!("best[height<={}]", q);
            args.extend(["-f".to_string(), quality_arg]);
        }
        let url_arg = format!("https://www.youtube.com/watch?v={}", video_id);
        args.push(url_arg);

        let output = tokio::process::Command::new("yt-dlp")
            .args(&args)
            .output()
            .await
            .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("yt-dlp failed: {}", stderr));
        }
        
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(StreamUrl { url, format: format.unwrap_or("mp4").to_string(), quality: quality.unwrap_or("720p").to_string(), headers: None })
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
/// Note the real capture's audioStreams are EMPTY (PO-token gating) — the
/// instance branch then errors and resolve_stream falls through to yt-dlp,
/// which is the designed failover.
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
fn select_piped_stream(
    streams: PipedStreams,
    format: Option<&str>,
    quality: Option<&str>,
) -> Result<StreamUrl, String> {
    let want_audio = matches!(format, Some(f) if f.eq_ignore_ascii_case("audio"));
    let list = if want_audio {
        streams.audio_streams
    } else {
        streams.video_streams
    };

    let best = list
        .into_iter()
        .filter(|s| !s.url.is_empty())
        .filter(|s| quality.map_or(true, |q| s.quality.as_deref().map_or(false, |sq| sq.contains(q))))
        .max_by_key(|s| piped_quality_rank(&s.quality))
        .ok_or("No suitable stream found")?;

    Ok(StreamUrl {
        url: best.url,
        format: best.format.unwrap_or_else(|| "mp4".to_string()),
        quality: best.quality.unwrap_or_else(|| "720p".to_string()),
        headers: None,
    })
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
            Some(VideoInfo {
                id,
                title: e.title.unwrap_or_default(),
                description: None,
                duration: e.duration.map(|d| d.max(0.0) as u64),
                thumbnail: None,
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

    const PIPED_FIXTURE: &str = include_str!("fixtures/piped_search.json");
    const INVIDIOUS_FIXTURE: &str = include_str!("fixtures/invidious_search.json");
    const YTDLP_FIXTURE: &str = include_str!("fixtures/yt_dlp_search.json");

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

    #[test]
    fn piped_streams_audio_selection_on_gated_fixture_errors() {
        let streams = parse_piped_streams(PIPED_STREAMS_FIXTURE).expect("parse");
        assert!(
            select_piped_stream(streams, Some("audio"), None).is_err(),
            "no audio streams published — resolve_stream must fall through to yt-dlp"
        );
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
        };
        let streams = PipedStreams {
            audio_streams: vec![],
            video_streams: vec![mk("https://a", "360p"), mk("https://b", "1080p"), mk("https://c", "720p")],
        };
        let picked = select_piped_stream(streams, Some("video"), None).expect("best stream");
        assert_eq!(picked.quality, "1080p", "must rank by numeric quality, not list order");
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
            if let Some(pairing) = scorer.best_pairing(pod, &candidates, &config) {
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
