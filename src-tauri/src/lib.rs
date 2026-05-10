mod approval;
mod pty;
mod tray;
mod window;

use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            pty::manage_pty_state(app);

            #[cfg(desktop)]
            {
                tray::create_tray(app.handle())?;
                approval::start_watcher(app.handle().clone())?;

                use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

                let handle = app.handle().clone();

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts(["CommandOrControl+Shift+H"])?
                        .with_handler(move |app, shortcut, event| {
                            if event.state == ShortcutState::Pressed
                                && shortcut.matches(
                                    Modifiers::SUPER | Modifiers::SHIFT,
                                    Code::KeyH,
                                )
                            {
                                window::toggle_window_visibility(app);
                            }
                        })
                        .build(),
                )?;

                #[cfg(target_os = "macos")]
                {
                    if let Some(w) = handle.get_webview_window("main") {
                        // Defer NSPanel style application to after the window event
                        // loop has fully initialized — calling it during setup
                        // triggers a foreign ObjC exception in tao 0.34.x.
                        let w_clone = w.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            window::apply_ns_panel_style(&w_clone);
                        });
                    }
                }

                let minimized = std::env::args()
                    .take_while(|arg| arg != "--")
                    .any(|arg| arg == "--minimized");

                if !minimized {
                    if let Some(w) = handle.get_webview_window("main") {
                        if let Some(pos) = window::load_position_from_disk(&handle) {
                            let _ = w.set_position(tauri::Position::Physical(
                                tauri::PhysicalPosition::new(pos.x, pos.y),
                            ));
                            let _ = w.set_size(tauri::Size::Physical(
                                tauri::PhysicalSize::new(pos.width, pos.height),
                            ));
                        }
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            approval::list_pending_approvals,
            approval::approve_command,
            approval::deny_command,
            approval::generate_approval_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
