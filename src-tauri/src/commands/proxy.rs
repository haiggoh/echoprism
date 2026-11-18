//! Proxy commands (the local 127.0.0.1 stream/embed server lives in
//! `crate::stream_proxy`).

/// Task 5: the local proxy's port, so the frontend can build the embed host
/// page URL `http://127.0.0.1:<port>/embed/player.html`.
#[tauri::command]
pub fn proxy_port() -> u16 {
    crate::stream_proxy::state().port
}
