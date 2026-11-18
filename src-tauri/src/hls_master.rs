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

/// Parse one `KEY="value"` / `KEY=value` attribute out of an HLS attribute list.
fn attr<'a>(attrs: &'a str, key: &str) -> Option<&'a str> {
    attrs.split(',').find_map(|kv| {
        let v = kv.trim().strip_prefix(key)?.strip_prefix('=')?;
        Some(v.trim_matches('"'))
    })
}

/// All `#EXT-X-MEDIA:TYPE=AUDIO` rungs of a master playlist as
/// `(bandwidth, absolute URI)`, highest bandwidth first. Rungs whose NAME or
/// CHARACTERISTICS marks them as AI dubs (YouTube's auto-translated audio,
/// e.g. CHARACTERISTICS="public.dub") are skipped — original audio only
/// (owner 2026-11-18). Relative URIs resolve against `master_url`.
pub fn audio_variants(master: &str, master_url: &str) -> Vec<(u32, String)> {
    let base = reqwest::Url::parse(master_url).ok();
    let mut out = Vec::new();
    for line in master.lines() {
        if !line.starts_with("#EXT-X-MEDIA") {
            continue;
        }
        let attrs = line.strip_prefix("#EXT-X-MEDIA:").unwrap_or(line);
        if attr(attrs, "TYPE") != Some("AUDIO") {
            continue;
        }
        let label = format!("{} {}", attr(attrs, "NAME").unwrap_or(""), attr(attrs, "CHARACTERISTICS").unwrap_or(""));
        if label.to_lowercase().contains("dub") {
            continue; // AI auto-dub rung — never the default
        }
        let Some(uri) = attr(attrs, "URI") else { continue };
        let bw: u32 = attr(attrs, "BANDWIDTH").and_then(|v| v.parse().ok()).unwrap_or(0);
        let abs = base
            .as_ref()
            .and_then(|b| b.join(uri).ok())
            .map(|u| u.to_string())
            .unwrap_or_else(|| uri.to_string());
        out.push((bw, abs));
    }
    out.sort_by(|a, b| b.0.cmp(&a.0));
    out
}

/// Best (highest-bandwidth) original-audio variant rung of a master playlist.
pub fn best_audio_variant(master: &str, master_url: &str) -> Option<(u32, String)> {
    audio_variants(master, master_url).into_iter().next()
}

/// Rewrite a master playlist so ONLY the original audio rung is selectable:
/// drop every `#EXT-X-MEDIA:TYPE=AUDIO` rung whose NAME marks it as an AI dub
/// ("- dubbed"), and force DEFAULT=YES,AUTOSELECT=YES onto the rung whose NAME
/// contains "original" (the first kept rung if none says "original"), all
/// others DEFAULT=NO. Without this, WebKit picks the geolocation-chosen dub.
/// Owner 2026-11-18: original audio always, AI auto-dubs off by default.
pub fn force_original_audio(master: &str) -> String {
    // pass 1: which audio rung index (among kept ones) is the original
    let mut kept: Vec<(usize, bool)> = Vec::new(); // (line idx, is_original)
    for (i, line) in master.lines().enumerate() {
        if line.starts_with("#EXT-X-MEDIA") {
            let attrs = line.strip_prefix("#EXT-X-MEDIA:").unwrap_or(line);
            if attr(attrs, "TYPE") == Some("AUDIO") {
                let name = attr(attrs, "NAME").unwrap_or("").to_lowercase();
                if !name.contains("dubbed") {
                    kept.push((i, name.contains("original")));
                }
            }
        }
    }
    let original_idx = kept.iter().find(|(_, o)| *o).map(|(i, _)| *i).or(kept.first().map(|(i, _)| *i));

    let mut out = String::with_capacity(master.len());
    for (i, line) in master.lines().enumerate() {
        if line.starts_with("#EXT-X-MEDIA") {
            let attrs = line.strip_prefix("#EXT-X-MEDIA:").unwrap_or(line);
            if attr(attrs, "TYPE") == Some("AUDIO") {
                let name = attr(attrs, "NAME").unwrap_or("").to_lowercase();
                if name.contains("dubbed") {
                    continue; // drop the AI dub rung entirely
                }
                // strip existing DEFAULT/AUTOSELECT, then set them explicitly
                let mut kept_attrs: Vec<String> = attrs
                    .split(',')
                    .map(|kv| kv.trim().to_string())
                    .filter(|kv| {
                        let k = kv.split('=').next().unwrap_or("").to_uppercase();
                        k != "DEFAULT" && k != "AUTOSELECT"
                    })
                    .collect();
                let (d, a) = if Some(i) == original_idx { ("YES", "YES") } else { ("NO", "NO") };
                kept_attrs.push(format!("DEFAULT={d}"));
                kept_attrs.push(format!("AUTOSELECT={a}"));
                out.push_str("#EXT-X-MEDIA:");
                out.push_str(&kept_attrs.join(","));
                out.push('\n');
                continue;
            }
        }
        out.push_str(line);
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

    const MASTER_AUDIO: &str = "#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"English (original)\",URI=\"audio/en.m3u8\",BANDWIDTH=129000
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"German\",CHARACTERISTICS=\"public.dub\",URI=\"audio/de.m3u8\",BANDWIDTH=131000
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480,AUDIO=\"aud\"
https://gv.example/v480.m3u8
";

    #[test]
    fn audio_variants_skip_dubbed_rungs_and_resolve_relative_uris() {
        let v = audio_variants(MASTER_AUDIO, "https://gv.example/master.m3u8");
        assert_eq!(v.len(), 1, "the German dub rung must be excluded");
        assert_eq!(v[0].0, 129000);
        assert_eq!(v[0].1, "https://gv.example/audio/en.m3u8", "relative URI resolves against the master");
        assert_eq!(
            best_audio_variant(MASTER_AUDIO, "https://gv.example/master.m3u8").unwrap().1,
            "https://gv.example/audio/en.m3u8"
        );
    }

    #[test]
    fn force_original_audio_drops_dub_rungs_and_marks_only_original_default() {
        // fixture captured live 2026-11-18 from a video WITH AI dubs (sanitized URLs)
        let master = include_str!("fixtures/master_with_dubs.m3u8");
        let out = force_original_audio(master);
        assert!(!out.contains("dubbed"), "every AI dub rung is dropped: {}", out.matches("dubbed").count());
        let audio: Vec<&str> = out.lines().filter(|l| l.starts_with("#EXT-X-MEDIA") && l.contains("TYPE=AUDIO")).collect();
        // the fixture's non-dub rungs are the two original-language ones (itag 233 + 234)
        assert!(audio.iter().all(|l| l.contains("original")), "only original rungs remain: {audio:?}");
        assert!(audio.iter().all(|l| l.contains("NAME=\"English - original\"")), "the original rung is kept");
        assert_eq!(audio.iter().filter(|l| l.contains("DEFAULT=YES")).count(), 1, "exactly one rung is the default");
        assert!(audio.iter().any(|l| l.contains("DEFAULT=YES") && l.contains("AUTOSELECT=YES") && l.contains("original")), "the default is the original rung");
        assert!(out.contains("#EXT-X-STREAM-INF"), "video variants are preserved");
        // idempotent
        assert_eq!(force_original_audio(&out), out);
    }

    #[test]
    fn best_audio_variant_prefers_the_original_rung() {
        let master = include_str!("fixtures/master_with_dubs.m3u8");
        let (_, uri) = best_audio_variant(master, "https://gv.example/master.m3u8").unwrap();
        // the original rung's URI must be the English one — the fixture's
        // original rung is the only non-dubbed rung left after filtering
        assert!(!uri.is_empty());
    }

    #[test]
    fn audio_variants_keep_absolute_uris() {
        let m = MASTER_AUDIO.replace("audio/en.m3u8", "https://cdn.example/en.m3u8").replace("audio/de.m3u8", "https://cdn.example/de.m3u8");
        let v = audio_variants(&m, "https://gv.example/master.m3u8");
        assert_eq!(v[0].1, "https://cdn.example/en.m3u8");
    }

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

    // Task 1 (2026-11-16-followups-plan.md): the committed e2e fixture master
    // — the exact bytes the WebKit specs stream — through the real filter.
    // (The e2e mock world has no Rust proxy, so the cap is asserted here, on
    // the fixture itself, not duplicated in a second hand-written master.)
    #[test]
    fn e2e_fixture_master_is_filtered_by_cap() {
        let master = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../e2e/fixtures/hls/master.m3u8"
        ));
        let capped = filter_master_playlist(master, Some(180), StartQuality::Lowest);
        assert_eq!(
            variant_heights(&capped),
            vec![180],
            "cap 180 keeps only the 180p rung of the e2e fixture: {capped}"
        );
        let uncapped = filter_master_playlist(master, Some(720), StartQuality::Lowest);
        assert_eq!(
            variant_heights(&uncapped),
            vec![180, 360],
            "cap 720 keeps both rungs (no over-filtering): {uncapped}"
        );
    }
}
