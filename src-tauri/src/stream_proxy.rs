//! Local HTTP proxy for upstream URLs that REQUIRE headers (googlevideo
//! stream URLs do). A webview media element sets no request headers, so a
//! direct googlevideo URL fails to load ("Stream error"). The proxy listens
//! on 127.0.0.1 (random port) and forwards Range requests with the stored
//! headers, streaming the body back — so seeking works too.
//!
//! Started lazily on first `register` (extractor context always has a tokio
//! runtime; the tauri async runtime in production).

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use dashmap::DashMap;
use futures_util::{StreamExt, stream};
use http_body_util::combinators::BoxBody;
use http_body_util::{BodyExt, StreamBody};
use hyper::body::{Bytes, Frame, Incoming};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;

type ProxyError = Box<dyn std::error::Error + Send + Sync>;
type ProxyBody = BoxBody<Bytes, ProxyError>;

/// Re-resolve the upstream URL+headers when the upstream 403s/410s. NOTE
/// (round 6, measured 2026-11-05): a googlevideo URL 403s until its yt-dlp
/// `available_at` (~4 s after extraction) — the earlier reading "URLs expire
/// within seconds" was that, inverted. The callback waits for the fresh URL's
/// `available_at` before returning it.
pub type RefreshFn = Arc<
    dyn Fn() -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<(String, HashMap<String, String>)>> + Send>>
        + Send
        + Sync,
>;

struct Entry {
    url: String,
    headers: HashMap<String, String>,
    refresh: Option<RefreshFn>,
}

struct ProxyState {
    entries: DashMap<String, Entry>,
    client: reqwest::Client,
    port: u16,
}

static PROXY: OnceLock<Arc<ProxyState>> = OnceLock::new();

/// Idle limit between upstream body chunks. NOT a total timeout: googlevideo
/// throttles audio-only to ~2x playback rate (measured 32 KB/s for 129 kbps),
/// so one media request legitimately streams for many minutes — the old 300 s
/// total timeout killed audio playback at exactly 5:00 (round 6, MediaError 2).
const PROXY_IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// The upstream client: bounded connect + bounded IDLE read, unbounded total.
fn proxy_client(idle: std::time::Duration) -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .read_timeout(idle)
        .build()
        .expect("proxy client")
}

fn state() -> Arc<ProxyState> {
    PROXY.get_or_init(|| {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind proxy");
        let port = listener.local_addr().expect("addr").port();
        let state = Arc::new(ProxyState {
            entries: DashMap::new(),
            client: proxy_client(PROXY_IDLE_TIMEOUT),
            port,
        });
        let st = state.clone();
        let _ = listener.set_nonblocking(true);
        tauri::async_runtime::spawn(async move {
            let listener = tokio::net::TcpListener::from_std(listener).expect("tokio listener");
            loop {
                let Ok((stream, _)) = listener.accept().await else { break };
                let st = st.clone();
                tauri::async_runtime::spawn(async move {
                    let io = TokioIo::new(stream);
                    let _ = http1::Builder::new()
                        .serve_connection(io, service_fn(move |req| handle(st.clone(), req)))
                        .await;
                });
            }
        });
        state
    })
    .clone()
}

/// Store `url` + its required `headers`, returning the local URL the media
/// element should load instead. `refresh` is invoked when the upstream
/// answers 403/410 (e.g. past the URL's expiry): it returns a FRESH
/// (url, headers) and the in-flight request is retried against it.
pub fn register_with_refresh(url: &str, headers: HashMap<String, String>, refresh: Option<RefreshFn>) -> String {
    let st = state();
    let token = uuid::Uuid::new_v4().simple().to_string();
    st.entries.insert(
        token.clone(),
        Entry { url: url.to_string(), headers, refresh },
    );
    format!("http://127.0.0.1:{}/stream/{}", st.port, token)
}

async fn handle(
    st: Arc<ProxyState>,
    req: Request<Incoming>,
) -> Result<Response<ProxyBody>, std::convert::Infallible> {
    let token = req.uri().path().rsplit('/').next().unwrap_or("").to_string();
    let Some(entry) = st.entries.get(&token) else {
        return Ok(Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(empty_body())
            .unwrap());
    };
    let range = req.headers().get(hyper::header::RANGE).cloned();
    // What the media element asks for (round 6 diagnosis; RUST_LOG=debug).
    tracing::debug!(
        "stream proxy req: method={} range={:?} ua={:?} token={}",
        req.method(),
        range,
        req.headers().get(hyper::header::USER_AGENT),
        &token[..8.min(token.len())]
    );
    let mut url = entry.url.clone();
    let mut headers = entry.headers.clone();
    let refresh = entry.refresh.clone();
    drop(entry);

    // Upstream may answer 403/410 for an expired (or not-yet-available)
    // googlevideo URL. If we have a refresh callback, get a FRESH url+headers
    // (it waits for available_at) and retry once against it.
    let mut resp = send_upstream(&st, &url, &headers, range.as_ref()).await;
    if matches!(resp.as_ref(), Ok(r) if r.status() == 403 || r.status() == 410) {
        if let Some(refresh) = refresh {
            if let Some((fresh_url, fresh_headers)) = refresh().await {
                tracing::info!("stream proxy: upstream expired (403/410), refreshed URL, retrying");
                if let Some(mut e) = st.entries.get_mut(&token) {
                    e.url = fresh_url.clone();
                    e.headers = fresh_headers.clone();
                }
                url = fresh_url;
                headers = fresh_headers;
                resp = send_upstream(&st, &url, &headers, range.as_ref()).await;
            }
        }
    }
    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            let note: ProxyError = Box::new(e);
            return Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(BodyExt::boxed(StreamBody::new(stream::iter(std::iter::once(Ok(
                    Frame::data(Bytes::from(note.to_string())),
                ))))))
                .unwrap());
        }
    };
    let status = resp.status();
    // What we answer with (round 6 diagnosis; RUST_LOG=debug).
    tracing::debug!(
        "stream proxy resp: status={} ct={:?} cl={:?} cr={:?} host={}",
        status,
        resp.headers().get(hyper::header::CONTENT_TYPE),
        resp.headers().get(hyper::header::CONTENT_LENGTH),
        resp.headers().get(hyper::header::CONTENT_RANGE),
        resp.url().host_str().unwrap_or("?")
    );
    let mut builder = Response::builder().status(status);
    for h in [
        hyper::header::CONTENT_TYPE,
        hyper::header::CONTENT_LENGTH,
        hyper::header::CONTENT_RANGE,
        hyper::header::ACCEPT_RANGES,
    ] {
        if let Some(v) = resp.headers().get(&h) {
            builder = builder.header(h, v);
        }
    }
    let stream = resp
        .bytes_stream()
        .map(|chunk| chunk.map(Frame::data).map_err(|e| -> ProxyError { Box::new(e) }));
    Ok(builder.body(BodyExt::boxed(StreamBody::new(stream))).unwrap())
}

fn empty_body() -> ProxyBody {
    BodyExt::boxed(StreamBody::new(stream::empty::<Result<Frame<Bytes>, ProxyError>>()))
}

async fn send_upstream(
    st: &ProxyState,
    url: &str,
    headers: &HashMap<String, String>,
    range: Option<&hyper::header::HeaderValue>,
) -> Result<reqwest::Response, reqwest::Error> {
    let mut up = st.client.request(Method::GET, url);
    for (k, v) in headers {
        up = up.header(k, v);
    }
    if let Some(range) = range {
        up = up.header(hyper::header::RANGE, range);
    }
    up.send().await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Delivery-level: a fake upstream that answers a Range request with 206,
    /// then a client GET through the proxy must see 206 + the exact bytes and
    /// the upstream must have received the Range header.
    #[tokio::test]
    async fn proxy_forwards_range_and_streams_body() {
        let upstream = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let up_port = upstream.local_addr().unwrap().port();
        let (got_range_tx, mut got_range_rx) = tokio::sync::oneshot::channel::<Option<String>>();
        tauri::async_runtime::spawn(async move {
            let (mut sock, _) = upstream.accept().await.unwrap();
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut buf = vec![0u8; 4096];
            let n = sock.read(&mut buf).await.unwrap();
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let range = req
                .lines()
                .find(|l| l.to_ascii_lowercase().starts_with("range:"))
                .map(|l| l.splitn(2, ':').nth(1).unwrap().trim().to_string());
            let _ = got_range_tx.send(range);
            let resp = "HTTP/1.1 206 Partial Content\r\nContent-Type: video/mp4\r\nContent-Range: bytes 0-9/100\r\nContent-Length: 10\r\nAccept-Ranges: bytes\r\n\r\n0123456789";
            sock.write_all(resp.as_bytes()).await.unwrap();
        });

        let mut headers = HashMap::new();
        headers.insert("User-Agent".to_string(), "EchoPrism-test".to_string());
        let local = register_with_refresh(&format!("http://127.0.0.1:{}/video.mp4", up_port), headers, None);
        assert!(local.starts_with("http://127.0.0.1:"), "{local}");

        let client = reqwest::Client::new();
        let resp = client
            .get(&local)
            .header("Range", "bytes=0-9")
            .send()
            .await
            .expect("proxy response");
        assert_eq!(resp.status(), 206, "range must pass through");
        assert_eq!(
            resp.headers().get("content-range").unwrap(),
            "bytes 0-9/100"
        );
        let body = resp.bytes().await.unwrap();
        assert_eq!(&body[..], b"0123456789");
        assert_eq!(
            got_range_rx.try_recv().ok().flatten().as_deref(),
            Some("bytes=0-9"),
            "upstream must receive the Range header"
        );
    }

    /// Round 5 delivery test: upstream 403s the original URL; the refresh
    /// callback supplies a fresh one; the in-flight request is retried and the
    /// client sees the fresh body with 206.
    #[tokio::test]
    async fn proxy_refreshes_expired_upstream_url_on_403() {
        let upstream = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let up_port = upstream.local_addr().unwrap().port();
        tauri::async_runtime::spawn(async move {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            while let Ok((mut sock, _)) = upstream.accept().await {
                tauri::async_runtime::spawn(async move {
                    // keep-alive: answer every request on this connection
                    loop {
                        let mut buf = vec![0u8; 4096];
                        let n = match sock.read(&mut buf).await {
                            Ok(0) | Err(_) => break,
                            Ok(n) => n,
                        };
                        let req = String::from_utf8_lossy(&buf[..n]).to_string();
                        let path = req.lines().next().unwrap_or("").split_whitespace().nth(1).unwrap_or("");
                        let (status, body) = if path.contains("fresh") {
                            ("206 Partial Content", "FRESH")
                        } else {
                            ("403 Forbidden", "expired")
                        };
                        let resp = format!(
                            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Range: bytes 0-4/100\r\nConnection: keep-alive\r\n\r\n{body}",
                            body.len()
                        );
                        if sock.write_all(resp.as_bytes()).await.is_err() {
                            break;
                        }
                    }
                });
            }
        });

        let mut headers = HashMap::new();
        headers.insert("User-Agent".to_string(), "t".to_string());
        let refresh: super::RefreshFn = std::sync::Arc::new(move || {
            Box::pin(async move {
                Some((
                    format!("http://127.0.0.1:{up_port}/fresh.mp4"),
                    [("User-Agent".to_string(), "t".to_string())].into_iter().collect(),
                ))
            })
        });
        let local = register_with_refresh(&format!("http://127.0.0.1:{up_port}/old.mp4"), headers, Some(refresh));

        let resp = reqwest::Client::new()
            .get(&local)
            .header("Range", "bytes=0-4")
            .send()
            .await
            .expect("proxy response");
        assert_eq!(resp.status(), 206, "must retry with the refreshed URL: {}", resp.status());
        let body = resp.bytes().await.unwrap();
        assert_eq!(&body[..], b"FRESH");
    }

    /// Round 6 (measured live 2026-11-05): audio-only died with MediaError 2
    /// exactly 300.7 s into playback — the proxy client had a 300 s TOTAL
    /// timeout, and googlevideo throttles audio to ~32 KB/s so one request
    /// streams for many minutes. A slow-but-steady body must survive past the
    /// limit: here chunks arrive every 0.5 s for 3 s against a 1 s limit.
    #[tokio::test]
    async fn proxy_client_survives_a_slow_steady_body_longer_than_its_timeout() {
        let upstream = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = upstream.local_addr().unwrap().port();
        tauri::async_runtime::spawn(async move {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let (mut sock, _) = upstream.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let _ = sock.read(&mut buf).await;
            sock.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: audio/mp4\r\nContent-Length: 6\r\n\r\n").await.unwrap();
            for b in b"ABCDEF" {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                sock.write_all(&[*b]).await.unwrap();
            }
        });
        let client = proxy_client(std::time::Duration::from_secs(1));
        let body = client
            .get(format!("http://127.0.0.1:{port}/slow"))
            .send()
            .await
            .expect("headers")
            .bytes()
            .await
            .expect("a slow-but-steady body must not be cut off by a total timeout");
        assert_eq!(&body[..], b"ABCDEF");
    }

    #[test]
    fn register_returns_loopback_url_with_unique_tokens() {
        let a = register_with_refresh("http://x/1", HashMap::new(), None);
        let b = register_with_refresh("http://x/2", HashMap::new(), None);
        assert_ne!(a, b);
        assert!(a.starts_with("http://127.0.0.1:"));
    }
}
