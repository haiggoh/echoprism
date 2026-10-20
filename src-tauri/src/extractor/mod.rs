//! Video extraction using yt-dlp and Invidious/Piped APIs

use crate::types::*;
use crate::instance_pool::InstancePool;
use tauri::{AppHandle, Manager};
use std::sync::Arc;
use serde::{Deserialize, Serialize};

pub struct Extractor {
    client: reqwest::Client,
    pool: Arc<InstancePool>,
    /// Resolved once on first use; the extractor lives in `Arc` managed state,
    /// so memoization uses `OnceLock` rather than `&mut`.
    yt_dlp_path: std::sync::OnceLock<String>,
}

impl Extractor {
    pub fn new(app_handle: AppHandle) -> Self {
        let pool = app_handle.state::<Arc<crate::instance_pool::InstancePool>>().inner().clone();

        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("Mozilla/5.0 (compatible; EchoPrism/0.1)")
                .build()
                .expect("Failed to create HTTP client"),
            pool,
            yt_dlp_path: std::sync::OnceLock::new(),
        }
    }
    
    /// Extract video info using yt-dlp
    pub async fn extract_with_yt_dlp(&self, url: &str) -> Result<VideoInfo, String> {
        // Try to find yt-dlp binary
        let yt_dlp = self.find_yt_dlp().await?;
        
        let output = tokio::process::Command::new(&yt_dlp)
            .args([
                "--dump-json",
                "--no-playlist",
                "--no-warnings",
                "--skip-download",
                url,
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("yt-dlp failed: {}", stderr));
        }
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        let info: YtDlpOutput = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse yt-dlp output: {}", e))?;
        
        Ok(self.convert_yt_dlp_output(info))
    }
    
    /// Extract video info using Invidious/Piped instance
    pub async fn extract_with_instance(&self, video_id: &str, instance: &Instance) -> Result<VideoInfo, String> {
        let _url = format!("{}/api/v1/videos/{}", instance.url.trim_end_matches('/'), video_id);
        
        let response = reqwest::get(&format!("{}/api/v1/videos/{}", instance.url.trim_end_matches('/'), video_id))
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Instance returned error: {}", response.status()));
        }
        
        let invidious_response: InvidiousVideoResponse = response.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        Ok(self.convert_invidious_response(invidious_response))
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

    /// Get stream URL for playback via one instance (yt-dlp fallback inside).
    pub async fn get_stream_url(&self, video_id: &str, format: Option<&str>, quality: Option<&str>, instance: &Instance) -> Result<StreamUrl, String> {
        self.resolve_stream(video_id, format, quality, std::slice::from_ref(instance)).await
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
    
    async fn get_stream_from_instance(&self, video_id: &str, instance: &Instance, format: Option<&str>, quality: Option<&str>) -> Result<StreamUrl, String> {
        let url = format!("{}/api/v1/videos/{}/streams", instance.url.trim_end_matches('/'), video_id);
        
        let mut query = vec![];
        if let Some(f) = format { query.push(("format", f.to_string())); }
        if let Some(q) = quality { query.push(("quality", q.to_string())); }
        
        let response = reqwest::Client::new()
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
    
    fn convert_yt_dlp_output(&self, info: YtDlpOutput) -> VideoInfo {
        VideoInfo {
            id: info.id,
            title: info.title,
            description: info.description,
            duration: info.duration.map(|d| d as u64),
            thumbnail: info.thumbnail,
            channel: info.uploader,
            channel_id: info.uploader_id,
            upload_date: info.upload_date,
            view_count: info.view_count,
            formats: info.formats.unwrap_or_default().into_iter().map(|f| VideoFormat {
                format_id: f.format_id,
                ext: f.ext,
                resolution: f.resolution,
                fps: f.fps,
                vcodec: f.vcodec,
                acodec: f.acodec,
                filesize: f.filesize,
                url: f.url,
            }).collect(),
        }
    }
    
    fn convert_invidious_response(&self, resp: InvidiousVideoResponse) -> VideoInfo {
        VideoInfo {
            id: resp.video_id,
            title: resp.title,
            description: Some(resp.description),
            duration: Some(resp.length_seconds),
            thumbnail: resp.video_thumbnails.last().map(|t| t.url.clone()),
            channel: Some(resp.author),
            channel_id: Some(resp.author_id),
            upload_date: resp.published_text,
            view_count: Some(resp.view_count),
            formats: resp.adaptive_formats.into_iter().map(|f| VideoFormat {
                format_id: f.format_id,
                ext: f.container,
                resolution: Some(format!("{}x{}", f.width, f.height)),
                fps: None,
                vcodec: Some(f.encoding),
                acodec: None,
                filesize: None,
                url: f.url,
            }).collect(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YtDlpOutput {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub uploader: Option<String>,
    pub uploader_id: Option<String>,
    pub upload_date: Option<String>,
    pub view_count: Option<u64>,
    pub formats: Option<Vec<YtDlpFormat>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YtDlpFormat {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub filesize: Option<u64>,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvidiousVideoResponse {
    pub video_id: String,
    pub title: String,
    pub description: String,
    pub length_seconds: u64,
    pub video_thumbnails: Vec<InvidiousThumbnail>,
    pub author: String,
    pub author_id: String,
    pub published_text: Option<String>,
    pub view_count: u64,
    pub adaptive_formats: Vec<InvidiousFormat>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvidiousThumbnail {
    pub url: String,
    pub width: u32,
    pub height: u32,
    pub quality: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InvidiousFormat {
    pub format_id: String,
    pub container: String,
    pub width: u32,
    pub height: u32,
    pub encoding: String,
    pub bitrate: u64,
    pub url: String,
    pub quality: String,
    pub itag: u32,
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
}
