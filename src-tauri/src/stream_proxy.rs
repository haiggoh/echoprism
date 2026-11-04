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

struct ProxyState {
    entries: DashMap<String, (String, HashMap<String, String>)>,
    client: reqwest::Client,
    port: u16,
}

static PROXY: OnceLock<Arc<ProxyState>> = OnceLock::new();

fn state() -> Arc<ProxyState> {
    PROXY.get_or_init(|| {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind proxy");
        let port = listener.local_addr().expect("addr").port();
        let state = Arc::new(ProxyState {
            entries: DashMap::new(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .build()
                .expect("proxy client"),
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

/// Store `url` + its required `headers`; returns the local URL the media
/// element should load instead.
pub fn register(url: &str, headers: HashMap<String, String>) -> String {
    let st = state();
    let token = uuid::Uuid::new_v4().simple().to_string();
    st.entries.insert(token.clone(), (url.to_string(), headers));
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
    let (url, headers) = entry.clone();
    drop(entry);

    let mut up = st.client.request(Method::GET, &url);
    for (k, v) in &headers {
        up = up.header(k, v);
    }
    if let Some(range) = req.headers().get(hyper::header::RANGE) {
        up = up.header(hyper::header::RANGE, range);
    }
    let resp = match up.send().await {
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
        let local = register(&format!("http://127.0.0.1:{}/video.mp4", up_port), headers);
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

    #[test]
    fn register_returns_loopback_url_with_unique_tokens() {
        let a = register("http://x/1", HashMap::new());
        let b = register("http://x/2", HashMap::new());
        assert_ne!(a, b);
        assert!(a.starts_with("http://127.0.0.1:"));
    }
}
