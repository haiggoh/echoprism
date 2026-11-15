//! Settings commands

use crate::db::Database;
use crate::types::*;
use tauri::{command, State};

#[command]
pub async fn get_settings(db: State<'_,  Database>) -> std::result::Result<UserPreferences, String> {
    db.get_preferences().await
}

#[command]
pub async fn update_settings(
    db: State<'_,  Database>,
    extractor: State<'_,  std::sync::Arc<crate::extractor::Extractor>>,
    prefs: UserPreferencesPatch,
) -> std::result::Result<(), String> {
    // A partial from the UI, merged over the stored row (see the tests below).
    let current = db.get_preferences().await?;
    let merged = prefs.apply(current);
    db.update_preferences(merged.clone()).await?;
    // Task 10: the HLS master cap/start are read per resolve by the extractor
    // — push the effective caps (data saver forces 480) into its live state.
    let (_windowed, fullscreen) = merged.effective_caps();
    *extractor.hls_cap.write().unwrap() = fullscreen;
    *extractor.hls_start.write().unwrap() = match merged.start_quality {
        StartQualityPref::Lowest => crate::hls_master::StartQuality::Lowest,
        StartQualityPref::Cap => crate::hls_master::StartQuality::Cap,
    };
    Ok(())
}

#[cfg(test)]
mod tests {
    //! Parity audit batch 3, Task 1 (A2): every Settings control sends a
    //! ONE-FIELD partial (`settingsCommands.update({ card_click_action })`),
    //! while this command deserialized a full `UserPreferences`. The mock
    //! merges partials, so every gate was green while the real app could not
    //! save a single preference.
    use super::*;
    use serde_json::json;

    fn base() -> UserPreferences {
        serde_json::from_value(json!({
            "user_id": "current-user",
            "default_instance_id": null,
            "default_format": "unified",
            "queue_behavior": "play_next",
            "audio_only_default": false,
            "auto_download_wifi": false,
            "sponsorblock_enabled": true,
            "sponsorblock_categories": ["sponsor"],
            "keyboard_shortcuts_enabled": true,
            "theme": "dark",
            "cross_device_sync_enabled": false,
            "card_click_action": "queue",
            "updated_at": "2026-11-02T00:00:00Z"
        }))
        .expect("base prefs fixture")
    }

    #[test]
    fn full_struct_rejects_partial_json() {
        // The measured defect, pinned so it cannot be re-introduced by
        // pointing the command back at the full struct.
        let partial = json!({ "audio_only_default": true });
        assert!(serde_json::from_value::<UserPreferences>(partial).is_err());
    }

    #[test]
    fn partial_patch_deserializes_and_merges() {
        let patch: UserPreferencesPatch =
            serde_json::from_value(json!({ "audio_only_default": true })).expect("a one-field patch parses");
        let merged = patch.apply(base());
        assert!(merged.audio_only_default, "the patched field changed");
        assert_eq!(merged.theme.to_string(), "dark", "untouched fields keep their stored value");
        assert_eq!(merged.sponsorblock_categories, vec!["sponsor".to_string()]);
        assert_eq!(merged.user_id, "current-user");
    }

    #[test]
    fn empty_patch_is_a_no_op() {
        let patch: UserPreferencesPatch = serde_json::from_value(json!({})).unwrap();
        let merged = patch.apply(base());
        assert_eq!(serde_json::to_value(&merged).unwrap(), serde_json::to_value(base()).unwrap());
    }

    // ---- Task 10: playback quality / podcast settings ----

    #[test]
    fn old_preferences_row_parses_with_new_defaults() {
        // The base() fixture predates the Task 10 fields — it must still
        // parse, with the owner defaults filled in by serde.
        let p: UserPreferences = base();
        assert_eq!(p.windowed_quality_cap, Some(720), "default windowed cap");
        assert_eq!(p.fullscreen_quality_cap, Some(2160), "default fullscreen cap");
        assert_eq!(p.start_quality, StartQualityPref::Lowest);
        assert!(!p.data_saver);
        assert!(!p.audio_only_on_metered);
        assert_eq!(p.metered_restore, MeteredRestore::Restore);
        assert!(p.skip_podcast_trackers, "tracker stripping on by default");
    }

    #[test]
    fn one_field_patch_updates_only_that_field() {
        let patch: UserPreferencesPatch =
            serde_json::from_value(json!({ "data_saver": true })).expect("one-field patch parses");
        let merged = patch.apply(base());
        assert!(merged.data_saver, "the patched field changed");
        assert_eq!(merged.windowed_quality_cap, Some(720), "untouched field keeps its default");
        assert_eq!(merged.theme.to_string(), "dark", "unrelated field untouched");
    }

    #[test]
    fn data_saver_forces_480_caps() {
        let mut p = base();
        p.windowed_quality_cap = Some(1080);
        p.fullscreen_quality_cap = Some(2160);
        assert_eq!(p.effective_caps(), (Some(1080), Some(2160)));
        p.data_saver = true;
        assert_eq!(p.effective_caps(), (Some(480), Some(480)), "data saver forces 480p everywhere");
    }
}

#[cfg(test)]
mod card_click_tests {
    //! Parity audit batch 3, Task 5 — owner decision 2026-11-02: the default
    //! card click ADDS TO THE QUEUE (as Play next, per queue_behavior); 'auto'
    //! (play when idle, queue when busy — one click, two behaviours) is retired.
    //! The owner's own DB holds 'auto' (the old schema default), so a legacy
    //! value must read as the new default, never as an error (Review Focus 4).
    use crate::types::CardClickAction;
    use std::str::FromStr;

    #[test]
    fn legacy_auto_reads_as_queue() {
        assert_eq!(CardClickAction::from_str("auto").unwrap(), CardClickAction::Queue);
        let v: CardClickAction = serde_json::from_str("\"auto\"").unwrap();
        assert_eq!(v, CardClickAction::Queue);
        assert_eq!(CardClickAction::Queue.to_string(), "queue", "always written back as queue");
        assert_eq!(CardClickAction::default(), CardClickAction::Queue);
    }

    #[tokio::test]
    async fn migration_rewrites_a_stored_auto_row() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::db::migrations::run(&pool).await.unwrap();
        sqlx::query("INSERT OR REPLACE INTO user_preferences (user_id, card_click_action) VALUES ('current-user', 'auto')")
            .execute(&pool)
            .await
            .unwrap();
        crate::db::migrations::run(&pool).await.unwrap();
        let stored: String = sqlx::query_scalar("SELECT card_click_action FROM user_preferences WHERE user_id = 'current-user'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(stored, "queue");
    }
}
