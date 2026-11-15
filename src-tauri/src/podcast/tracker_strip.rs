//! Podcast tracker-redirect stripping (plan: browser-fast playback start,
//! Task 7). Measured 2026-11-15: a megaphone feed goes through 5 tracker hops
//! (podtrac → pdst.fm → pscrb.fm → mgln.ai → traffic.megaphone.fm →
//! dcs-cached.megaphone.fm); stripping them measured 1.3–1.5 s → 0.30–0.35 s
//! first byte. The hosting platform still counts the download.

use std::time::Duration;

/// Known tracker prefixes as (host, fixed path prefix after `host/`,
/// token-must-be-digits). The variable token between the fixed prefix and
/// the embedded URL runs up to the next `/` (podtrac's `redirect.<ext>`,
/// mgln.ai's `e/<digits>`, chartable's `track/<id>`, …).
const TRACKERS: &[(&str, &str, bool)] = &[
    ("podtrac.com", "pts/redirect.", false),
    ("dts.podtrac.com", "redirect.", false),
    ("pdst.fm", "e/", false),
    ("pscrb.fm", "rss/p/", false),
    ("mgln.ai", "e/", true),
    ("chtbl.com", "track/", false),
    ("chrt.fm", "track/", false),
    ("op3.dev", "e/", false),
    ("pfx.vpixl.com", "", false),
];

/// Repeatedly strip known tracker prefixes until none remains. The embedded
/// URL keeps its query string; an embedded bare host gets `https://`
/// re-added. Unknown or truncated prefixes leave the URL untouched.
pub fn strip_trackers(url: &str) -> String {
    let mut current = url.to_string();
    loop {
        let next = strip_one(&current).unwrap_or_else(|| current.clone());
        if next == current {
            return current;
        }
        current = next;
    }
}

fn strip_one(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    for &(host, prefix, digits_only) in TRACKERS {
        // Real feeds use www.podtrac.com etc. — match the bare and www hosts.
        let after_host = rest
            .strip_prefix(&format!("{host}/"))
            .or_else(|| rest.strip_prefix(&format!("www.{host}/")));
        let Some(after_host) = after_host else { continue };
        let Some(after_prefix) = after_host.strip_prefix(prefix) else { continue };
        // If the remainder already starts with a scheme, the variable token
        // is empty and the embedded URL is the whole remainder. Otherwise the
        // token runs to the next '/' — but a first segment containing a '.'
        // is an embedded HOST, not a token (bare-host form: op3.dev/e/host/x).
        let embedded = if after_prefix.starts_with("https://") || after_prefix.starts_with("http://") {
            after_prefix
        } else {
            match after_prefix.find('/') {
                Some(slash) => {
                    let token = &after_prefix[..slash];
                    if digits_only {
                        if token.is_empty() || !token.chars().all(|c| c.is_ascii_digit()) {
                            continue; // malformed token → untouched
                        }
                        &after_prefix[slash + 1..]
                    } else if !token.is_empty() && !token.contains('.') {
                        &after_prefix[slash + 1..]
                    } else {
                        after_prefix // bare embedded host follows the prefix directly
                    }
                }
                None => continue, // truncated → untouched
            }
        };
        if embedded.is_empty() {
            continue; // truncated → untouched
        }
        return Some(if embedded.starts_with("http://") || embedded.starts_with("https://") {
            embedded.to_string()
        } else {
            format!("https://{embedded}")
        });
    }
    None
}

/// Resolve the remaining redirect chain ahead of time (queue pre-follow
/// ONLY — never on hover): one 1-byte Range GET, returns the final URL.
pub async fn follow_redirects(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(url)
        .header(reqwest::header::RANGE, "bytes=0-0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !(status.is_success() || status == 206) {
        return Err(format!("follow_redirects: HTTP {status}"));
    }
    Ok(resp.url().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_the_measured_megaphone_chain() {
        let chained = "https://podtrac.com/pts/redirect.mp3/https://pdst.fm/e/https://pscrb.fm/rss/p/https://mgln.ai/e/1004386376/https://traffic.megaphone.fm/VMP1004386376.mp3";
        assert_eq!(
            strip_trackers(chained),
            "https://traffic.megaphone.fm/VMP1004386376.mp3",
            "repeated stripping must unwrap the whole nested chain"
        );
    }

    #[test]
    fn strips_podtrac_only() {
        assert_eq!(
            strip_trackers("https://podtrac.com/pts/redirect.mp3/https://cdn.example.com/ep.mp3"),
            "https://cdn.example.com/ep.mp3"
        );
        assert_eq!(
            strip_trackers("https://dts.podtrac.com/redirect.wav/https://cdn.example.com/ep.wav"),
            "https://cdn.example.com/ep.wav"
        );
    }

    #[test]
    fn strips_the_real_dev_db_megaphone_url_www_and_bare_hosts() {
        // Verbatim from the owner's dev DB (read-only sqlite3): www host AND
        // scheme-less embedded hosts chained after the tracker prefixes.
        let real = "https://www.podtrac.com/pts/redirect.mp3/pdst.fm/e/pscrb.fm/rss/p/mgln.ai/e/257/traffic.megaphone.fm/VMP6148219444.mp3";
        assert_eq!(
            strip_trackers(real),
            "https://traffic.megaphone.fm/VMP6148219444.mp3"
        );
    }

    #[test]
    fn strips_chartable_then_podtrac_nested() {
        assert_eq!(
            strip_trackers("https://chtbl.com/track/ABC123/https://podtrac.com/pts/redirect.mp3/https://cdn.example.com/ep.mp3"),
            "https://cdn.example.com/ep.mp3"
        );
        assert_eq!(
            strip_trackers("https://chrt.fm/track/9x/https://op3.dev/e/https://cdn.example.com/ep.mp3"),
            "https://cdn.example.com/ep.mp3"
        );
    }

    #[test]
    fn query_string_preserved() {
        assert_eq!(
            strip_trackers("https://chtbl.com/track/ABC123/https://cdn.example.com/ep.mp3?utm=1&x=2"),
            "https://cdn.example.com/ep.mp3?utm=1&x=2"
        );
    }

    #[test]
    fn embedded_host_without_scheme_gets_https() {
        assert_eq!(
            strip_trackers("https://op3.dev/e/cdn.example.com/ep.mp3"),
            "https://cdn.example.com/ep.mp3"
        );
        assert_eq!(
            strip_trackers("https://pfx.vpixl.com/ab12cd/https://cdn.example.com/ep.mp3"),
            "https://cdn.example.com/ep.mp3"
        );
    }

    #[test]
    fn unknown_prefix_untouched() {
        let u = "https://example.com/pts/redirect.mp3/https://x/y.mp3";
        assert_eq!(strip_trackers(u), u, "host not in the tracker list → unchanged");
        let u2 = "https://not-a-tracker.com/e/https://x/y.mp3";
        assert_eq!(strip_trackers(u2), u2);
        let plain = "https://cdn.example.com/ep.mp3?a=1";
        assert_eq!(strip_trackers(plain), plain);
    }

    #[test]
    fn truncated_prefix_untouched() {
        let t = "https://pdst.fm/e/";
        assert_eq!(strip_trackers(t), t, "nothing after the prefix → untouched");
        let t2 = "https://mgln.ai/e/";
        assert_eq!(strip_trackers(t2), t2);
        // mgln.ai requires DIGITS in the token: non-digits → untouched
        let t3 = "https://mgln.ai/e/abc/https://cdn.example.com/ep.mp3";
        assert_eq!(strip_trackers(t3), t3);
    }

    #[tokio::test]
    async fn follow_redirects_returns_final_url() {
        // /a → 302 /b → 302 /c → 206: a 1-byte Range GET must land on /c.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tauri::async_runtime::spawn(async move {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            loop {
                let Ok((mut sock, _)) = listener.accept().await else { break };
                tauri::async_runtime::spawn(async move {
                    loop {
                        let mut buf = vec![0u8; 4096];
                        let n = match sock.read(&mut buf).await { Ok(0) | Err(_) => break, Ok(n) => n };
                        let req = String::from_utf8_lossy(&buf[..n]).to_string();
                        let path = req.lines().next().unwrap_or("").split_whitespace().nth(1).unwrap_or("").to_string();
                        let resp = match path.as_str() {
                            "/a" => "HTTP/1.1 302 Found\r\nLocation: /b\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
                            "/b" => "HTTP/1.1 302 Found\r\nLocation: /c\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
                            _ => "HTTP/1.1 206 Partial Content\r\nContent-Type: audio/mpeg\r\nContent-Length: 1\r\nContent-Range: bytes 0-0/100\r\nConnection: close\r\n\r\nX".to_string(),
                        };
                        if sock.write_all(resp.as_bytes()).await.is_err() { break; }
                    }
                });
            }
        });
        let final_url = follow_redirects(&format!("http://127.0.0.1:{port}/a")).await.expect("follow");
        assert_eq!(final_url, format!("http://127.0.0.1:{port}/c"));
    }
}
