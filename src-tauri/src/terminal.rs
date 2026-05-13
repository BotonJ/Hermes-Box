//! Terminal launch via .command file — uses macOS file association
//! to open the user's default terminal (Terminal.app / iTerm2 / Ghostty).

use std::fs;
use std::path::PathBuf;
use std::process::Command;

const SCRIPT_DIR: &str = ".hermes/tmp";

/// Wraps a string in single quotes for safe shell embedding.
/// Internal single quotes are escaped via the `'\''` idiom.
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Launches the given CLI command in a terminal app.
/// Creates a .command script in ~/.hermes/tmp/ and opens it via `open`.
/// If `terminal` is provided, uses `open -a <terminal>` to target a specific app.
/// Otherwise falls back to system default via bare `open`.
pub fn launch_in_default_terminal(command: &str, terminal: Option<&str>) -> Result<(), String> {
    if command.trim().is_empty() {
        return Err("CLI command cannot be empty".to_string());
    }

    let script_path = get_script_path()?;

    // Build script: run CLI, then replace with interactive shell to keep window open.
    // Script self-deletes after exec to prevent temp file accumulation.
    let script_content = format!(
        "#!/bin/bash\ncd \"$HOME\"\ntrap 'rm -f \"$0\"' EXIT\n{}\nexec $SHELL\n",
        shell_escape(command)
    );

    // Clean up stale .command files older than 1 day on each launch
    cleanup_stale_scripts(&script_path.parent().unwrap().to_path_buf());

    // Ensure directory exists
    fs::create_dir_all(script_path.parent().unwrap())
        .map_err(|e| e.to_string())?;

    // Write script file
    fs::write(&script_path, script_content)
        .map_err(|e| e.to_string())?;

    // Set executable permission (Unix only)
    #[cfg(unix)]
    set_executable(&script_path)?;

    // Open with system default or specific terminal via file association
    if let Some(app_name) = terminal {
        Command::new("open")
            .args(["-a", app_name])
            .arg(script_path.to_str().unwrap())
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        Command::new("open")
            .arg(script_path.to_str().unwrap())
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(unix)]
fn set_executable(path: &std::path::Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)
        .map_err(|e| e.to_string())?
        .permissions();
    perms.set_mode(0o700);
    fs::set_permissions(path, perms)
        .map_err(|e| e.to_string())
}

fn get_script_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
    let tmp_dir = PathBuf::from(home).join(SCRIPT_DIR);
    let filename = format!("cli-{}.command", uuid::Uuid::new_v4());
    Ok(tmp_dir.join(filename))
}

/// Removes .command files older than 24 hours from the tmp directory.
fn cleanup_stale_scripts(dir: &PathBuf) {
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(86_400);
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "command") {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        if modified < cutoff {
                            let _ = fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }
}

#[derive(serde::Serialize)]
pub struct TerminalApp {
    pub name: String,
    pub bundle: String,
}

/// Detects installed terminal apps by checking /Applications/ for known bundles.
#[tauri::command]
pub fn detect_terminals() -> Vec<TerminalApp> {
    const APPS: &[(&str, &str)] = &[
        ("Terminal", "Terminal.app"),
        ("iTerm", "iTerm.app"),
        ("Ghostty", "Ghostty.app"),
        ("Alacritty", "Alacritty.app"),
        ("Kitty", "Kitty.app"),
        ("WezTerm", "WezTerm.app"),
        ("Warp", "Warp.app"),
        ("Hyper", "Hyper.app"),
    ];

    APPS
        .iter()
        .filter_map(|&(name, bundle)| {
            let path = format!("/Applications/{bundle}");
            if std::path::Path::new(&path).exists() {
                Some(TerminalApp {
                    name: name.to_string(),
                    bundle: bundle.to_string(),
                })
            } else {
                None
            }
        })
        .collect()
}

#[tauri::command]
pub fn launch_in_terminal(cli: String, terminal: Option<String>) -> Result<(), String> {
    launch_in_default_terminal(&cli, terminal.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_escape_wraps_in_single_quotes() {
        assert_eq!(shell_escape("hermes"), "'hermes'");
    }

    #[test]
    fn shell_escape_escapes_internal_single_quotes() {
        assert_eq!(shell_escape("it's"), "'it'\\''s'");
    }

    #[test]
    fn shell_escape_blocks_command_substitution() {
        let escaped = shell_escape("hermes$(whoami)");
        assert_eq!(escaped, "'hermes$(whoami)'");
        // The $() is literal inside single quotes — no execution
    }

    #[test]
    fn shell_escape_blocks_backtick_substitution() {
        let escaped = shell_escape("hermes`whoami`");
        assert_eq!(escaped, "'hermes`whoami`'");
    }

    #[test]
    fn empty_command_rejected() {
        assert!(launch_in_default_terminal("", None).is_err());
        assert!(launch_in_default_terminal("  ", None).is_err());
    }
}