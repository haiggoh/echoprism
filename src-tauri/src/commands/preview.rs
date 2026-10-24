//! Hover-preview command (Phase E) — a thin surface over the extractor's
//! storyboard lookup; the contract test derives this file against
//! useTauriCommands.

use crate::extractor::StoryboardSpec;
use crate::instance_pool::InstancePool;
use std::sync::Arc;
use tauri::{command, State};

/// The storyboard for one video, or None when no candidate instance serves
/// one (the UI then keeps the static thumbnail).
#[command]
pub async fn preview_frames(
    pool: State<'_, InstancePool>,
    extractor: State<'_, Arc<crate::extractor::Extractor>>,
    video_id: String,
) -> std::result::Result<Option<StoryboardSpec>, String> {
    let candidates = crate::instance_pool::order_for_search(&pool.get_all().await);
    Ok(extractor.preview_frames(&video_id, &candidates).await)
}
