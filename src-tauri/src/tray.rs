use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::window;

pub fn create_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_hide = MenuItem::with_id(app, "show_hide", "Show HermesBox", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_hide, &settings, &separator, &quit])?;

    TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .cloned()
                .ok_or("no default window icon configured — check tauri.conf.json icons")?,
        )
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("HermesBox")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show_hide" => {
                window::toggle_window_visibility(app);
                update_menu_label(app);
            }
            "settings" => {
                let _ = app.emit("navigate-settings", ());
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                window::toggle_window_visibility(app);
                update_menu_label(app);
            }
        })
        .build(app)?;

    Ok(())
}

fn update_menu_label(app: &AppHandle) {
    let visible = app
        .get_webview_window("main")
        .is_some_and(|w| w.is_visible().unwrap_or(false));

    let label = if visible {
        "Hide HermesBox"
    } else {
        "Show HermesBox"
    };

    if let Some(menu) = app.menu() {
        if let Some(item) = menu.get("show_hide") {
            let mi = item.as_menuitem_unchecked();
            let _ = mi.set_text(label);
        }
    }
}