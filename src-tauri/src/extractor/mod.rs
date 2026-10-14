//! Video extraction using yt-dlp and Invidious/Piped APIs

use crate::types::*;
use crate::instance_pool::InstancePool;
use tauri::{AppHandle, Manager};
use reqwest::Client;
use std::sync::Arc;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tracing::{info, warn, error};

pub struct Extractor {
    client: reqwest::Client,
    pool: InstancePool,
    yt_dlp_path: Option<String>,
}

impl Extractor {
    pub fn new(app_handle: AppHandle) -> Self {
        let pool = app_handle.state::<crate::instance_pool::InstancePool>().inner().clone();

        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("Mozilla/5.0 (compatible; EchoPrism/0.1)")
                .build()
                .expect("Failed to create HTTP client"),
            pool,
            yt_dlp_path: None, // Will be detected at runtime
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
        let url = format!("{}/api/v1/videos/{}", instance.url.trim_end_matches('/'), video_id);
        
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
    
    /// Get stream URL for playback
    pub async fn get_stream_url(&self, video_id: &str, format: Option<&str>, quality: Option<&str>, instance: &Instance) -> Result<StreamUrl, String> {
        // Try Invidious/Piped first
        if let Ok(stream) = self.get_stream_from_instance(video_id, instance, format, quality).await {
            return Ok(stream);
        }
        
        // Fallback to yt-dlp
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
        let yt_dlp = self.find_yt_dlp().await?;

        let mut args = vec!["-g", "--no-playlist", "--no-warnings"];
        if let Some(f) = format { args.extend(["-f", f]); }
        if let Some(q) = quality {
            let quality_arg = format!("best[height<={}]", q);
            args.extend(["-f", &quality_arg]);
        }
        let url_arg = format!("https://www.youtube.com/watch?v={}", video_id);
        args.push(&url_arg);

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
        if let Some(path) = &self.yt_dlp_path {
            return Ok(path.clone());
        }
        
        // Try common locations
        let candidates = vec![
            "yt-dlp",
            "python3 -m yt_dlp",
            "/usr/local/bin/yt-dlp",
            "/opt/homebrew/bin/yt-dlp",
        ];
        
        for cmd in candidates {
            if tokio::process::Command::new("sh")
                .args(["-c", &format!("{} --version", cmd)])
                .output()
                .await
                .is_ok()
            {
                return Ok(cmd.to_string());
            }
        }
        
        Err("yt-dlp not found. Please install yt-dlp.".to_string())
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
            description: resp.description,
            duration: resp.length_seconds,
            thumbnail: resp.video_thumbnails.last().map(|t| t.url.clone()),
            channel: resp.author,
            channel_id: resp.author_id,
            upload_date: resp.published_text,
            view_count: resp.view_count,
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
