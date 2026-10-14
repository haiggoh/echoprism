//! EchoPrism - Unified Video & Podcast Player
//!
//! A Tauri application that converges YouTube watching and podcast listening
//! into one unified stream.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod types;
mod commands;
mod db;
mod instance_pool;
mod extractor;
mod matcher;
mod podcast;
mod sponsorblock;
mod background_tasks;

use std::sync::Arc;
use tauri::Manager;

fn single_instance_handler(app: &tauri::AppHandle, _args: Vec<String>, _cwd: String) {
    let _ = app.get_webview_window("main").map(|w| w.set_focus());
}

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_media_session::init())
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_plugin_single_instance::init(single_instance_handler))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Initialize database
            let db = tauri::async_runtime::block_on(db::Database::new(app.handle()))?;
            app.manage(db);

            // Initialize instance pool
            let pool = instance_pool::InstancePool::new(app.handle().clone());
            app.manage(pool);

            // Initialize extractor
            let extractor = extractor::Extractor::new(app.handle().clone());
            app.manage(extractor);

            // Initialize matcher
            let matcher = matcher::EpisodeMatcher::new(app.handle().clone(), None);
            app.manage(matcher);

            // Initialize podcast manager
            let podcast = podcast::PodcastManager::new(app.handle().clone());
            app.manage(podcast);

            // Initialize SponsorBlock manager
            let sponsorblock = sponsorblock::SponsorBlockManager::new(Arc::new(db.clone()));
            app.manage(sponsorblock);

            // Start background tasks
            tauri::async_runtime::block_on(background_tasks::start_all(app.handle().clone()));

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
            commands::channels::unsubscribe,
            commands::channels::import,
            commands::channels::export,

            // Episode commands
            commands::episodes::get_feed,
            commands::episodes::get_episode,
            commands::episodes::search_episodes,
            commands::episodes::stream_episode,
            commands::episodes::smart_link_switch_episode,

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
            commands::playback::toggle_audio,
            commands::playback::smart_link,

            // Smart Links commands
            commands::smart_links::list_smart_links,
            commands::smart_links::match_episodes,
            commands::smart_links::confirm_smart_link,
            commands::smart_links::unlink_smart_link,

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

            // Background jobs
            commands::background::trigger_instance_health_check,
            commands::background::trigger_smart_linking,
            commands::background::trigger_feed_fetch,
            commands::background::trigger_sponsorblock_sync,
            commands::background::trigger_cleanup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}