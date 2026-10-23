//! Crash-reporting commands (4f, Phase C) — thin Tauri surface over the
//! pure capture logic in `crate::crash`. The contract test derives this
//! file's #[command] fns against useTauriCommands.

use crate::crash::{self, CrashRecord};
use tauri::{command, AppHandle, Manager};

#[command]
pub async fn get_crash_reports(app: AppHandle) -> std::result::Result<Vec<CrashRecord>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    Ok(crash::read_crash_records(&dir))
}

#[command]
pub async fn clear_crash_reports(app: AppHandle) -> std::result::Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    crash::clear_crash_records(&dir)
}

/// Frontend capture: window.onerror / unhandledrejection land here.
#[command]
pub async fn log_frontend_error(
    app: AppHandle,
    kind: String,
    message: String,
) -> std::result::Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    let home = std::env::var("HOME").unwrap_or_default();
    let message = crash::sanitize(&message, &home);
    let record = CrashRecord {
        signature: crash::signature(&kind, &message),
        kind,
        message,
        app_version: env!("CARGO_PKG_VERSION").into(),
        at: chrono::Utc::now().to_rfc3339(),
    };
    crash::write_crash_record(&dir, &record)
}

/// Open a URL in the user's DEFAULT browser (used for the prefilled crash
/// issue). `open` is macOS's standard opener; the URL is passed as ONE argv
/// element — no shell, no interpolation.
#[command]
pub async fn open_external_url(app: AppHandle, url: String) -> std::result::Result<(), String> {
    let _ = app;
    if !url.starts_with("https://") {
        return Err("refusing to open a non-https URL".into());
    }
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to open browser: {e}"))
}
