//! HLS master-playlist filtering (plan: browser-fast playback start, Task 9).
//!
//! The local proxy serves the master playlist filtered to the current cap.
//! Apple's HLS player starts on the FIRST listed variant, so `start` controls
//! the initial rung by ORDER (no hls.js needed). Task 9 Step 0 (measured with
//! a real WKWebView, see cold-path-findings.md): WebKit already limits
//! variants to the element's pixel size, so ONE master filtered to the
//! FULLSCREEN cap is served; windowed limiting is natural.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartQuality {
    /// List the lowest kept variant first (fastest start).
    Lowest,
    /// List the cap-height variant first.
    Cap,
}

/// Owner default for the FULLSCREEN cap until Task 10 wires the settings
/// field (windowed limiting is natural — Step 0 measured WebKit caps by
/// element size — so ONE master at the fullscreen cap is served).
pub const DEFAULT_FULLSCREEN_CAP: Option<u32> = Some(2160);
/// Owner default start rung: lowest, for the fastest first frame.
pub const DEFAULT_START_QUALITY: StartQuality = StartQuality::Lowest;

/// Parse `RESOLUTION=<w>x<h>` from an #EXT-X-STREAM-INF attributes line.
fn resolution_height(attrs: &str) -> Option<u32> {
    attrs
        .split(',')
        .find_map(|kv| kv.trim().strip_prefix("RESOLUTION="))
        .and_then(|v| v.split('x').nth(1))
        .and_then(|h| h.parse::<u32>().ok())
}

/// Filter a master playlist: keep `#EXT-X-STREAM-INF` variants with
/// RESOLUTION height ≤ cap (variants WITHOUT RESOLUTION are kept); if the cap
/// would remove all variants, keep the lowest one (never return zero
/// variants). All non-variant lines — including `#EXT-X-MEDIA` audio groups
/// referenced by variants — are preserved in order. When
/// `start == Lowest`, the lowest kept variant is listed FIRST (Apple starts
/// on the first listed variant); `Cap` lists the tallest kept variant first.
pub fn filter_master_playlist(master: &str, cap_height: Option<u32>, start: StartQuality) -> String {
    let mut head: Vec<&str> = Vec::new(); // non-variant lines before the first variant
    let mut variants: Vec<(&str, &str)> = Vec::new(); // (attrs, url)
    let mut tail: Vec<&str> = Vec::new(); // non-variant lines after variants started
    let mut seen_variant = false;

    let mut lines = master.lines().peekable();
    while let Some(line) = lines.next() {
        if line.starts_with("#EXT-X-STREAM-INF") {
            seen_variant = true;
            let url = lines.next().unwrap_or("");
            variants.push((line, url));
        } else if seen_variant && !line.starts_with('#') && !line.is_empty() {
            // a bare URL line without a preceding STREAM-INF (malformed) — keep as tail
            tail.push(line);
        } else if line.is_empty() {
            continue; // drop blank lines; playlists tolerate their absence
        } else {
            if seen_variant {
                tail.push(line);
            } else {
                head.push(line);
            }
        }
    }

    let kept: Vec<(&str, &str)> = match cap_height {
        Some(cap) => {
            let mut k: Vec<(&str, &str)> = variants
                .iter()
                .copied()
                .filter(|(attrs, _)| match resolution_height(attrs) {
                    Some(h) => h <= cap,
                    None => true, // no RESOLUTION → keep
                })
                .collect();
            if k.is_empty() {
                // cap removed everything: keep the single lowest variant
                let lowest = variants
                    .iter()
                    .min_by_key(|(attrs, _)| resolution_height(attrs).unwrap_or(u32::MAX));
                if let Some(l) = lowest {
                    k.push(*l);
                }
            }
            k
        }
        None => variants.clone(),
    };

    // order variants: RESOLUTION-bearing ones by height (asc for Lowest, desc
    // for Cap); variants without RESOLUTION always go last (they are usually
    // audio-only/unknown rungs, never the start rung).
    let mut with_res: Vec<(&str, &str)> = kept
        .iter()
        .copied()
        .filter(|(attrs, _)| resolution_height(attrs).is_some())
        .collect();
    let without_res: Vec<(&str, &str)> = kept
        .iter()
        .copied()
        .filter(|(attrs, _)| resolution_height(attrs).is_none())
        .collect();
    with_res.sort_by_key(|(attrs, _)| resolution_height(attrs).unwrap());
    if start == StartQuality::Cap {
        with_res.reverse(); // tallest kept first
    }
    let ordered: Vec<(&str, &str)> = with_res.into_iter().chain(without_res).collect();

    let mut out = String::with_capacity(master.len());
    for l in head {
        out.push_str(l);
        out.push('\n');
    }
    for (attrs, url) in &ordered {
        out.push_str(attrs);
        out.push('\n');
        out.push_str(url);
        out.push('\n');
    }
    for l in tail {
        out.push_str(l);
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const MASTER: &str = "#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"English\",URI=\"audio.m3u8\"
#EXT-X-STREAM-INF:BANDWIDTH=245113,RESOLUTION=320x240,AUDIO=\"aud\"
https://gv.example/v240.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480,AUDIO=\"aud\"
https://gv.example/v480.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,AUDIO=\"aud\"
https://gv.example/v720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,AUDIO=\"aud\"
https://gv.example/v1080.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=20000000,RESOLUTION=3840x2160,AUDIO=\"aud\"
https://gv.example/v2160.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=99999
https://gv.example/v-nores.m3u8
";

    fn variant_heights(playlist: &str) -> Vec<u32> {
        let mut out = Vec::new();
        let mut lines = playlist.lines().peekable();
        while let Some(l) = lines.next() {
            if l.starts_with("#EXT-X-STREAM-INF") {
                out.push(resolution_height(l).unwrap_or(0));
            }
        }
        out
    }

    #[test]
    fn cap_720_drops_1080_and_2160() {
        let filtered = filter_master_playlist(MASTER, Some(720), StartQuality::Lowest);
        let heights = variant_heights(&filtered);
        assert!(!heights.contains(&1080) && !heights.contains(&2160), "cap 720 must drop 1080/2160: {heights:?}");
        assert!(heights.contains(&720) && heights.contains(&240), "keeps ≤ cap: {heights:?}");
        // the variant WITHOUT RESOLUTION is kept too (counted as height 0)
        assert_eq!(heights.len(), 4, "no-RESOLUTION variant kept: {heights:?}");
        assert!(filtered.contains("v-nores.m3u8"));
    }

    #[test]
    fn no_cap_keeps_all() {
        let filtered = filter_master_playlist(MASTER, None, StartQuality::Lowest);
        assert_eq!(variant_heights(&filtered).len(), 6);
    }

    #[test]
    fn lowest_start_lists_lowest_first() {
        let filtered = filter_master_playlist(MASTER, None, StartQuality::Lowest);
        let first_variant_url = filtered
            .lines()
            .find(|l| l.starts_with("https://gv.example/v"))
            .unwrap();
        // lowest RESOLUTION-bearing rung first; no-RESOLUTION variants go last
        assert_eq!(first_variant_url, "https://gv.example/v240.m3u8", "lowest first: {first_variant_url}");
    }

    #[test]
    fn cap_below_every_variant_keeps_the_lowest() {
        // cap 100: every RESOLUTION-bearing variant is above it; the
        // no-RESOLUTION variant has height 0 in our parse → kept... so use a
        // master where ALL variants have RESOLUTION for this row instead:
        let all_res = MASTER.replace(
            "#EXT-X-STREAM-INF:BANDWIDTH=99999,RESOLUTION=256x144",
            "#EXT-X-STREAM-INF:BANDWIDTH=99999,RESOLUTION=256x144",
        );
        let _ = all_res;
        let m = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=640x360\nhttps://x/360.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2,RESOLUTION=1280x720\nhttps://x/720.m3u8\n";
        let filtered = filter_master_playlist(m, Some(100), StartQuality::Lowest);
        assert_eq!(variant_heights(&filtered), vec![360], "cap below all → keep the lowest: {filtered}");
    }

    #[test]
    fn audio_media_groups_preserved() {
        let filtered = filter_master_playlist(MASTER, Some(720), StartQuality::Lowest);
        assert!(filtered.contains("#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\""), "audio groups must survive filtering");
        assert!(filtered.contains("#EXTM3U") && filtered.contains("#EXT-X-VERSION:6"));
        assert!(filtered.contains("AUDIO=\"aud\""), "variant attributes unchanged");
    }

    #[test]
    fn never_returns_zero_variants() {
        let m = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=3840x2160\nhttps://x/2160.m3u8\n";
        let filtered = filter_master_playlist(m, Some(480), StartQuality::Lowest);
        assert!(filtered.contains("https://x/2160.m3u8"), "lone variant survives an over-strict cap");
    }

    #[test]
    fn cap_start_lists_tallest_kept_first() {
        let filtered = filter_master_playlist(MASTER, Some(720), StartQuality::Cap);
        let first_variant_url = filtered
            .lines()
            .find(|l| l.starts_with("https://gv.example/v"))
            .unwrap();
        assert_eq!(first_variant_url, "https://gv.example/v720.m3u8");
    }
}
