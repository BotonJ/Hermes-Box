use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::Manager;

#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

const POSITION_FILE: &str = "window-position.json";
const TMP_SUFFIX: &str = ".tmp";
const MIN_DIM: u32 = 100;
const MAX_DIM: u32 = 4000;
const MIN_COORD: i32 = -5000;
const MAX_COORD: i32 = 10000;

#[derive(serde::Serialize, serde::Deserialize, Default, Clone)]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

fn app_data_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok()
}

pub fn save_position_to_disk(app: &tauri::AppHandle, pos: &WindowPosition) {
    let dir = match app_data_dir(app) {
        Some(d) => d,
        None => {
            log::warn!("no app data dir — ensure identifier is set in tauri.conf.json");
            return;
        }
    };
    if let Err(e) = fs::create_dir_all(&dir) {
        log::warn!("failed to create app data dir: {e}");
        return;
    }
    save_position_to_disk_at_path(&dir.join(POSITION_FILE), pos);
}

/// Writes window position atomically: write to temp file, sync, then rename.
/// The rename is atomic on the same filesystem, preventing empty files from crashes.
fn save_position_to_disk_at_path(path: &Path, pos: &WindowPosition) {
    let json = match serde_json::to_string(pos) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("failed to serialize window position: {e}");
            return;
        }
    };

    let tmp_path = path.with_extension(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| format!("{e}{TMP_SUFFIX}"))
            .unwrap_or_else(|| TMP_SUFFIX.to_string()),
    );

    match fs::File::create(&tmp_path) {
        Ok(mut file) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Err(e) = file.set_permissions(fs::Permissions::from_mode(0o600)) {
                    log::warn!("failed to set file permissions: {e}");
                }
            }
            if let Err(e) = file.write_all(json.as_bytes()) {
                log::warn!("failed to save window position: {e}");
                let _ = fs::remove_file(&tmp_path);
                return;
            }
            if let Err(e) = file.sync_all() {
                log::warn!("failed to fsync position file: {e}");
            }
        }
        Err(e) => {
            log::warn!("failed to create position file: {e}");
            return;
        }
    }

    if let Err(e) = fs::rename(&tmp_path, path) {
        log::warn!("failed to rename temp position file: {e}");
        let _ = fs::remove_file(&tmp_path);
    }
}

pub fn load_position_from_disk(app: &tauri::AppHandle) -> Option<WindowPosition> {
    let dir = app_data_dir(app)?;
    let path = dir.join(POSITION_FILE);
    let pos = fs::read_to_string(&path)
        .ok()
        .and_then(|json| serde_json::from_str::<WindowPosition>(&json).ok())?;

    if is_valid_position(&pos) {
        return Some(pos);
    }
    // Try clamping (handles migration from old MAX_DIM=10000)
    match clamp_position(&pos) {
        Some(clamped) => {
            log::info!(
                "clamped window position from {}x{} to {}x{}",
                pos.width, pos.height, clamped.width, clamped.height
            );
            Some(clamped)
        }
        None => {
            log::warn!("saved window position has invalid values, ignoring");
            None
        }
    }
}

fn is_valid_position(pos: &WindowPosition) -> bool {
    pos.width >= MIN_DIM
        && pos.height >= MIN_DIM
        && pos.width <= MAX_DIM
        && pos.height <= MAX_DIM
        && pos.x >= MIN_COORD
        && pos.x <= MAX_COORD
        && pos.y >= MIN_COORD
        && pos.y <= MAX_COORD
}

/// Clamps position values that were valid under the old MAX_DIM (10000)
/// to the current limits. Values below MIN_DIM are rejected entirely.
pub fn clamp_position(pos: &WindowPosition) -> Option<WindowPosition> {
    if pos.width < MIN_DIM || pos.height < MIN_DIM {
        return None;
    }
    Some(WindowPosition {
        x: pos.x.clamp(MIN_COORD, MAX_COORD),
        y: pos.y.clamp(MIN_COORD, MAX_COORD),
        width: pos.width.min(MAX_DIM),
        height: pos.height.min(MAX_DIM),
    })
}

pub fn read_window_position(window: &tauri::WebviewWindow) -> Option<WindowPosition> {
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    Some(WindowPosition {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}

#[cfg(target_os = "macos")]
#[allow(dead_code)]
mod ns_constants {
    pub const NS_NORMAL_WINDOW_LEVEL: i32 = 0;
    pub const NS_COLLECTION_JOIN_ALL_SPACES: usize = 1 << 0;
    pub const NS_COLLECTION_FULL_SCREEN_PRIMARY: usize = 1 << 7;
    pub const NS_STYLE_MASK_FULL_SIZE_CONTENT_VIEW: usize = 1 << 15;
    pub const NS_VISUAL_EFFECT_MATERIAL_HUD: u32 = 4;
    pub const NS_VISUAL_EFFECT_BLENDING_BEHIND_WINDOW: u32 = 0;
    pub const NS_VISUAL_EFFECT_STATE_ACTIVE: u32 = 1;
}

#[cfg(target_os = "macos")]
#[allow(dead_code)]
pub fn apply_ns_panel_style(window: &tauri::WebviewWindow) {
    use ns_constants::*;

    let ns_window = match window.ns_window() {
        Ok(w) => w as *mut objc::runtime::Object,
        Err(e) => {
            log::warn!("failed to get NSWindow: {e}");
            return;
        }
    };

    // SAFETY: ns_window() returns a valid, aligned, initialized NSWindow pointer.
    // All msg_send! calls target the valid NSWindow or its well-known subviews.
    // This function must be called on the main thread (Tauri guarantees this for
    // window setup). The view hierarchy is not modified concurrently.
    unsafe {
        if ns_window.is_null() {
            return;
        }

        // NSNormalWindowLevel = 0 — allow other windows to cover HermesBox.
        // Previously used NSFloatingWindowLevel = 3 which caused drag issues.
        let _: () = msg_send![ns_window, setLevel: NS_NORMAL_WINDOW_LEVEL];

        let behavior: usize = NS_COLLECTION_JOIN_ALL_SPACES | NS_COLLECTION_FULL_SCREEN_PRIMARY;
        let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

        // Transparent titlebar + full-size content view
        let _: () = msg_send![ns_window, setTitlebarAppearsTransparent: true];
        let style_mask: usize = msg_send![ns_window, styleMask];
        let _: () = msg_send![
            ns_window,
            setStyleMask: style_mask | NS_STYLE_MASK_FULL_SIZE_CONTENT_VIEW
        ];

        hide_titlebar_container(ns_window);
        apply_vibrancy_to_content(ns_window);
    }
}

/// Find and hide the NSTitlebarContainer view so content extends into the
/// titlebar area without any visible titlebar chrome.
#[cfg(target_os = "macos")]
#[allow(dead_code)]
unsafe fn hide_titlebar_container(ns_window: *mut objc::runtime::Object) {
    let content_view: *mut objc::runtime::Object = msg_send![ns_window, contentView];
    if content_view.is_null() {
        return;
    }
    let superview: *mut objc::runtime::Object = msg_send![content_view, superview];
    if superview.is_null() {
        return;
    }
    let subviews: *mut objc::runtime::Object = msg_send![superview, subviews];
    if subviews.is_null() {
        return;
    }
    let count: usize = msg_send![subviews, count];
    for i in 0..count {
        let subview: *mut objc::runtime::Object = msg_send![subviews, objectAtIndex: i];
        if subview.is_null() {
            continue;
        }
        let class_name: *mut objc::runtime::Object = msg_send![subview, className];
        if class_name.is_null() {
            continue;
        }
        let c_str: *const std::os::raw::c_char = msg_send![class_name, UTF8String];
        if c_str.is_null() {
            continue;
        }
        let name = std::ffi::CStr::from_ptr(c_str).to_string_lossy();
        if name.contains("TitlebarContainer") || name.contains("NSTitlebar") {
            let _: () = msg_send![subview, setHidden: true];
            break;
        }
    }
}

/// Create an NSVisualEffectView and insert it behind the content view
/// to achieve the vibrancy/blurred-background effect.
#[cfg(target_os = "macos")]
#[allow(dead_code)]
unsafe fn apply_vibrancy_to_content(ns_window: *mut objc::runtime::Object) {
    use ns_constants::*;

    let content_view: *mut objc::runtime::Object = msg_send![ns_window, contentView];
    if content_view.is_null() {
        return;
    }

    let ns_visual_effect_class: *mut objc::runtime::Object =
        msg_send![objc::class!(NSVisualEffectView), class];
    if ns_visual_effect_class.is_null() {
        log::warn!("NSVisualEffectView class not found");
        return;
    }

    let frame: *mut objc::runtime::Object = msg_send![content_view, frame];
    let effect_view: *mut objc::runtime::Object =
        msg_send![ns_visual_effect_class, initWithFrame: frame];
    if effect_view.is_null() {
        log::warn!("failed to create NSVisualEffectView");
        return;
    }

    let _: () = msg_send![effect_view, setMaterial: NS_VISUAL_EFFECT_MATERIAL_HUD];
    let _: () = msg_send![effect_view, setBlendingMode: NS_VISUAL_EFFECT_BLENDING_BEHIND_WINDOW];
    let _: () = msg_send![effect_view, setState: NS_VISUAL_EFFECT_STATE_ACTIVE];
    let _: () = msg_send![effect_view, setWantsLayer: true];

    // Insert the effect view at index 0 (behind existing content)
    let _: () = msg_send![content_view, addSubview: effect_view positioned: 0 below: content_view];
}

pub fn toggle_window_visibility(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            if let Some(pos) = read_window_position(&window) {
                save_position_to_disk(app, &pos);
            }
            let _ = window.hide();
        } else {
            if let Some(pos) = load_position_from_disk(app) {
                if let Err(e) = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition::new(pos.x, pos.y),
                )) {
                    log::warn!("failed to restore window position: {e}");
                }
                if let Err(e) = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                    pos.width, pos.height,
                ))) {
                    log::warn!("failed to restore window size: {e}");
                }
            }
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[allow(dead_code)]
pub fn show_and_focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // Unminimize first — macOS minimized windows report is_visible() == true
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        if !window.is_visible().unwrap_or(false) {
            if let Some(pos) = load_position_from_disk(app) {
                if let Err(e) = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition::new(pos.x, pos.y),
                )) {
                    log::warn!("failed to restore window position: {e}");
                }
                if let Err(e) = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                    pos.width, pos.height,
                ))) {
                    log::warn!("failed to restore window size: {e}");
                }
            }
            let _ = window.show();
        }
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_position_passes_validation() {
        let pos = WindowPosition {
            x: 100,
            y: 200,
            width: 700,
            height: 480,
        };
        let json = serde_json::to_string(&pos).unwrap();
        let parsed: WindowPosition = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.x, 100);
        assert_eq!(parsed.y, 200);
        assert_eq!(parsed.width, 700);
        assert_eq!(parsed.height, 480);
    }

    #[test]
    fn rejects_below_min_dimensions() {
        let pos = WindowPosition {
            x: 100,
            y: 200,
            width: 50,
            height: 480,
        };
        assert!(!is_valid_position(&pos));
    }

    #[test]
    fn rejects_out_of_range_coordinates() {
        let pos = WindowPosition {
            x: -6000,
            y: 200,
            width: 700,
            height: 480,
        };
        assert!(!is_valid_position(&pos));
    }

    #[test]
    fn rejects_oversized_dimensions() {
        let pos = WindowPosition {
            x: 100,
            y: 200,
            width: 20000,
            height: 480,
        };
        assert!(!is_valid_position(&pos));
    }

    #[test]
    fn default_position_fails_validation() {
        assert!(!is_valid_position(&WindowPosition::default()));
    }

    fn make_test_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!("hermesbox-test-{}-{}", std::process::id(), name));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn cleanup_test_dir(dir: &Path) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_position_writes_valid_json() {
        let dir = make_test_dir("writes-valid");
        let path = dir.join("window-position.json");

        let pos = WindowPosition {
            x: 10,
            y: 20,
            width: 800,
            height: 600,
        };
        save_position_to_disk_at_path(&path, &pos);

        let content = fs::read_to_string(&path).unwrap();
        let parsed: WindowPosition = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed.x, 10);
        assert_eq!(parsed.y, 20);
        assert_eq!(parsed.width, 800);
        assert_eq!(parsed.height, 600);

        cleanup_test_dir(&dir);
    }

    #[test]
    fn save_position_no_temp_file_left_behind() {
        let dir = make_test_dir("no-tmp");
        let path = dir.join("window-position.json");
        let tmp_path = dir.join("window-position.json.tmp");

        let pos = WindowPosition {
            x: 10,
            y: 20,
            width: 800,
            height: 600,
        };
        save_position_to_disk_at_path(&path, &pos);

        assert!(
            !tmp_path.exists(),
            "temp file should be removed after atomic write"
        );

        cleanup_test_dir(&dir);
    }

    #[test]
    fn save_position_overwrites_existing() {
        let dir = make_test_dir("overwrite");
        let path = dir.join("window-position.json");

        let old = WindowPosition {
            x: 1,
            y: 2,
            width: 100,
            height: 100,
        };
        save_position_to_disk_at_path(&path, &old);

        let new = WindowPosition {
            x: 500,
            y: 600,
            width: 1200,
            height: 800,
        };
        save_position_to_disk_at_path(&path, &new);

        let content = fs::read_to_string(&path).unwrap();
        let parsed: WindowPosition = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed.x, 500);
        assert_eq!(parsed.y, 600);

        cleanup_test_dir(&dir);
    }

    #[test]
    fn clamp_migrates_oversized_dimensions() {
        let pos = WindowPosition {
            x: 100,
            y: 200,
            width: 8000,
            height: 6000,
        };
        let clamped = clamp_position(&pos).unwrap();
        assert_eq!(clamped.width, 4000);
        assert_eq!(clamped.height, 4000);
        assert_eq!(clamped.x, 100);
        assert_eq!(clamped.y, 200);
    }

    #[test]
    fn clamp_rejects_below_min() {
        let pos = WindowPosition {
            x: 100,
            y: 200,
            width: 50,
            height: 600,
        };
        assert!(clamp_position(&pos).is_none());
    }

    #[test]
    fn clamp_clamps_out_of_range_coords() {
        let pos = WindowPosition {
            x: -8000,
            y: 15000,
            width: 800,
            height: 600,
        };
        let clamped = clamp_position(&pos).unwrap();
        assert_eq!(clamped.x, -5000);
        assert_eq!(clamped.y, 10000);
    }

    #[test]
    fn clamp_leaves_valid_position_unchanged() {
        let pos = WindowPosition {
            x: 100,
            y: 200,
            width: 800,
            height: 600,
        };
        let clamped = clamp_position(&pos).unwrap();
        assert_eq!(clamped.x, pos.x);
        assert_eq!(clamped.y, pos.y);
        assert_eq!(clamped.width, pos.width);
        assert_eq!(clamped.height, pos.height);
    }
}