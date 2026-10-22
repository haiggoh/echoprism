//! EchoPrism - Unified Video & Podcast Player
//!
//! A Tauri application that converges YouTube watching and podcast listening
//! into one unified stream.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod types;
mod commands;
mod logging;
mod db;
mod instance_pool;
mod extractor;
mod matcher;
mod podcast;
mod sponsorblock;
mod background_tasks;
mod app_menu;

use std::sync::Arc;
use tauri::Manager;

fn single_instance_handler(app: &tauri::AppHandle, _args: Vec<String>, _cwd: String) {
    // A second launch while the window is hidden (macOS close-to-Dock) must
    // show it, not just focus an invisible window.
    let _ = app.get_webview_window("main").map(|w| {
        let _ = w.show();
        w.set_focus()
    });
}

/// What the window-state plugin persists across launches: geometry, not
/// visibility. Our macOS close HIDES the window, so with the default flags a
/// later Cmd+Q saved `visible:false` and the next launch's focus depended on
/// how the previous session ended. Without VISIBLE the plugin never calls
/// show(): the window config (`visible` defaults to true) owns visibility.
/// If that config is ever set to `"visible": false` (anti-flicker), the app
/// must call show() itself after restore, or it launches with no window.
fn window_state_flags() -> tauri_plugin_window_state::StateFlags {
    use tauri_plugin_window_state::StateFlags;
    StateFlags::all() - StateFlags::VISIBLE
}

/// Application entry point. Invoked by the thin binary shim in `src/main.rs`
/// — a library crate cannot host `fn main()`, and without a bin target
/// `cargo run` / `tauri dev` fail with "a bin target must be available".
pub fn run() {
    logging::init_tracing();
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_media_session::init())
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_plugin_single_instance::init(single_instance_handler))
        // Updater deferred until a release channel exists: its config REQUIRES
        // a real signing pubkey (no serde default) and update endpoints, and
        // with none published there is nothing to update from — registering it
        // panics at init ("invalid type: null, expected struct Config").
        // .plugin(tauri_plugin_updater::Builder::new().build())
        .menu(app_menu::build)
        .on_menu_event(app_menu::on_menu_event)
        .setup(|app| {
            // Managed-state type contract (measured across the codebase):
            // commands inject `State<'_, Database>` / `State<'_, InstancePool>`
            // (43 + 9 sites, bare), while the manager constructors in
            // extractor/matcher/background_tasks request `Arc<...>` views
            // (7 sites). Bare T and Arc<T> are DIFFERENT managed types, so
            // both views must be managed for the shared services. Clones
            // share inner state (Database wraps one SqlitePool; InstancePool
            // is #[derive(Clone)] over Arc fields).
            let db = tauri::async_runtime::block_on(db::Database::new(app.handle()))?;
            app.manage(db.clone());
            let db_shared: Arc<db::Database> = Arc::new(db);
            app.manage(db_shared.clone());

            // Initialize instance pool
            let pool = instance_pool::InstancePool::new(app.handle().clone());
            app.manage(pool.clone());
            let pool_shared = Arc::new(pool);
            app.manage(pool_shared.clone());

            // Initialize extractor
            let extractor = extractor::Extractor::new(app.handle().clone());
            app.manage(Arc::new(extractor));

            // Initialize matcher
            let matcher = matcher::EpisodeMatcher::new(app.handle().clone(), None);
            app.manage(Arc::new(matcher));

            // Initialize podcast manager
            let podcast = podcast::PodcastManager::new(app.handle().clone());
            app.manage(Arc::new(podcast));

            // Initialize SponsorBlock manager
            let sponsorblock = sponsorblock::SponsorBlockManager::new(db_shared.clone());
            app.manage(Arc::new(sponsorblock));

            // Seed default search instances on a fresh install, then load the
            // instance pool for search/failover. background_tasks (below)
            // owns the single health-check loop.
            tauri::async_runtime::block_on(async {
                match db_shared.seed_default_instances_if_empty().await {
                    Ok(0) => {}
                    Ok(n) => tracing::info!("Seeded {} default search instance(s)", n),
                    Err(e) => tracing::warn!("Default instance seeding failed: {}", e),
                }
                if let Err(e) = pool_shared.initialize().await {
                    tracing::warn!("Instance pool failed to load: {}", e);
                }
            });

            // Start background tasks
            background_tasks::start_all(app.handle().clone());

            Ok(())
        });

    builder
        .invoke_handler(tauri::generate_handler![
            // Instance commands
            commands::instances::list_instances,
            commands::instances::add_instance,
            commands::instances::remove_instance,
            commands::instances::test_instance,
            commands::instances::failover_instance,
            commands::instances::instance_health,
            commands::instances::set_auto_failover,
            commands::instances::health_dashboard,
            commands::instances::auto_failover_toggle,

            // Channel commands
            commands::channels::list,
            commands::channels::subscribe,
            commands::podcasts::search_podcasts,
            commands::podcasts::subscribe_podcast,
            commands::podcasts::refresh_podcasts,
            commands::channels::unsubscribe,
            commands::channels::import,
            commands::channels::export,

            // Episode commands
            commands::episodes::get_feed,
            commands::episodes::get_episode,
            commands::episodes::search_episodes,
            commands::episodes::stream_episode,

            // Queue commands
            commands::queue::get_queue,
            commands::queue::add_to_queue,
            commands::queue::reorder_queue,
            commands::queue::remove_queue_item,
            commands::queue::clear_queue,
            commands::queue::play_next_queue,

            // Playback commands
            commands::playback::state,
            commands::playback::update,

            // Smart Links commands
            commands::smart_links::list_smart_links,
            commands::smart_links::match_episodes,
            commands::smart_links::confirm_smart_link,
            commands::smart_links::unlink_smart_link,

            // Play-mode rule commands (D7)
            commands::play_mode_rules::list_play_mode_rules,
            commands::play_mode_rules::set_play_mode_rule,
            commands::play_mode_rules::remove_play_mode_rule,

            // Download commands
            commands::downloads::start_download,
            commands::downloads::list_downloads,
            commands::downloads::cancel_download,
            commands::downloads::delete_download,

            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,

            // History commands
            commands::history::list_history,
            commands::history::clear_history,

            // Keyboard shortcuts
            commands::shortcuts::list_shortcuts,
            commands::shortcuts::update_shortcut_cmd,
        ])
        // macOS convention: closing the window HIDES it and the app keeps
        // running in the Dock (playback included); clicking the Dock icon
        // brings it back, and Cmd+Q / the app menu still quits. Other
        // platforms keep close-to-quit, which is their convention.
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (window, event);
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Dock-icon click with no visible window (macOS "reopen").
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { has_visible_windows: false, .. } = event {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
#[cfg(test)]
mod tests {
    use super::window_state_flags;
    use tauri_plugin_window_state::StateFlags;

    /// macOS close HIDES the window, so quitting from the Dock afterwards
    /// would persist `visible:false` and the next launch would skip
    /// show()+set_focus() (window-state 2.5 `should_show = state.visible`).
    /// Geometry must still be remembered.
    #[test]
    fn window_state_remembers_geometry_but_not_visibility() {
        let flags = window_state_flags();
        assert!(!flags.contains(StateFlags::VISIBLE), "visibility must not be persisted");
        assert!(flags.contains(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED));
    }
}
