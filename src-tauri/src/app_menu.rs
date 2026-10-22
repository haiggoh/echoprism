//! Native "Playback" menu (step 2d). The items only EMIT an event; the
//! frontend routes it to the same player callbacks the in-app buttons and the
//! media keys use, so playback state keeps one authority (the player store).

use tauri::menu::{Menu, MenuEvent, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder, WINDOW_SUBMENU_ID};
use tauri::{AppHandle, Emitter, Runtime};

/// Event the frontend listens for; the payload is the action name.
pub const PLAYBACK_EVENT: &str = "menu-playback";

const ID_PREFIX: &str = "playback:";

/// (action, label, accelerator). Play/Pause has no accelerator on purpose:
/// Space is handled in-page, and a menu Space would eat typing in text fields.
pub const PLAYBACK_ITEMS: &[(&str, &str, Option<&str>)] = &[
    ("toggle", "Play/Pause", None),
    ("next", "Next", Some("CmdOrCtrl+Right")),
    ("previous", "Previous", Some("CmdOrCtrl+Left")),
    ("skip-forward", "Skip Forward", Some("Alt+CmdOrCtrl+Right")),
    ("skip-back", "Skip Back", Some("Alt+CmdOrCtrl+Left")),
];

/// The playback action a menu id names, or None for any other menu item
/// (the predefined App/Edit/Window items share the same event stream).
pub fn playback_action(menu_id: &str) -> Option<&'static str> {
    let action = menu_id.strip_prefix(ID_PREFIX)?;
    PLAYBACK_ITEMS.iter().find(|(a, _, _)| *a == action).map(|(a, _, _)| *a)
}

/// The default macOS menu (App/Edit/View/Window/Help — Edit carries the
/// copy/paste key equivalents text fields need) with Playback inserted before
/// Window, where macOS media apps put it.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let mut sub = SubmenuBuilder::new(app, "Playback");
    for (i, (action, label, accel)) in PLAYBACK_ITEMS.iter().enumerate() {
        // Separate track navigation from in-episode skipping.
        if i == 3 {
            sub = sub.item(&PredefinedMenuItem::separator(app)?);
        }
        let mut item = MenuItemBuilder::with_id(format!("{ID_PREFIX}{action}"), *label);
        if let Some(a) = accel {
            item = item.accelerator(*a);
        }
        sub = sub.item(&item.build(app)?);
    }
    let playback = sub.build()?;
    let items = menu.items()?;
    match items.iter().position(|i| i.id() == WINDOW_SUBMENU_ID) {
        Some(pos) => menu.insert(&playback, pos)?,
        None => menu.append(&playback)?,
    }
    Ok(menu)
}

pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if let Some(action) = playback_action(event.id().as_ref()) {
        let _ = app.emit(PLAYBACK_EVENT, action);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_item_id_parses_back_to_its_action() {
        for (action, _, _) in PLAYBACK_ITEMS {
            assert_eq!(playback_action(&format!("{ID_PREFIX}{action}")), Some(*action));
        }
    }

    #[test]
    fn foreign_and_unknown_ids_are_ignored() {
        assert_eq!(playback_action("__tauri_window_menu__"), None);
        assert_eq!(playback_action("next"), None, "the prefix is required");
        assert_eq!(playback_action("playback:rewind"), None);
    }

    #[test]
    fn accelerators_are_the_owner_agreed_set() {
        let accel = |a: &str| PLAYBACK_ITEMS.iter().find(|(x, _, _)| *x == a).unwrap().2;
        assert_eq!(accel("toggle"), None, "Space stays in-page");
        assert_eq!(accel("next"), Some("CmdOrCtrl+Right"));
        assert_eq!(accel("previous"), Some("CmdOrCtrl+Left"));
        assert_eq!(accel("skip-forward"), Some("Alt+CmdOrCtrl+Right"));
        assert_eq!(accel("skip-back"), Some("Alt+CmdOrCtrl+Left"));
    }
}
