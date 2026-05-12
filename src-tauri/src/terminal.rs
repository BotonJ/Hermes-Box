//! Terminal launch via .command file — uses macOS file association
//! to open the user's default terminal (Terminal.app / iTerm2 / Ghostty).

use std::fs;
use std::path::PathBuf;
use std::process::Command;

const SCRIPT_DIR: &str = ".hermes/tmp";

/// Launches the given CLI command in the user's default terminal.
/// Creates a .command script in ~/.hermes/tmp/ and opens it via `open`,
/// letting macOS route it to whichever terminal the user has set as default.
pub fn launch_in_default_terminal(command: &str) -> Result<(), String> {
    if command.trim().is_empty() {
        return Err("CLI command cannot be empty".to_string());
    }

    let script_path = get_script_path()?;

    // Build script content: shebang + quoted command + keep-window-open + self-delete
    let script_content = format!(
        "#!/bin/bash\ncd \"$HOME\"\nexec \"{}\"\nexec $SHELL\nrm \"$0\"\n",
        command
    );

    // Ensure directory exists
    fs::create_dir_all(script_path.parent().unwrap())
        .map_err(|e| e.to_string())?;

    // Write script file
    fs::write(&script_path, script_content)
        .map_err(|e| e.to_string())?;

    // Set executable permission (Unix only)
    #[cfg(unix)]
    set_executable(&script_path)?;

    // Open with system default terminal via file association
    Command::new("open")
        .arg(script_path.to_str().unwrap())
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(unix)]
fn set_executable(path: &std::path::Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)
        .map_err(|e| e.to_string())?
        .permissions();
    perms.set_mode(0o755);
    fs::set_permissions(path, perms)
        .map_err(|e| e.to_string())
}

fn get_script_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
    let tmp_dir = PathBuf::from(home).join(SCRIPT_DIR);
    let filename = format!("cli-{}.command", uuid::Uuid::new_v4());
    Ok(tmp_dir.join(filename))
}

#[tauri::command]
pub fn launch_in_terminal(cli: String) -> Result<(), String> {
    launch_in_default_terminal(&cli)
}