use crate::window;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApprovalRequest {
    pub id: String,
    pub tool_name: String,
    pub command: String,
    pub raw_json: String,
    #[serde(default)]
    pub source: String,
}

/// Escape a string for use inside a YAML double-quoted scalar.
/// Handles `\`, `"`, and control characters per YAML 1.2 spec.
#[allow(dead_code)]
fn escape_yaml_double_quoted(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            '\0' => out.push_str("\\0"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\x{:02x}", c as u8)),
            _ => out.push(ch),
        }
    }
    out
}

pub fn approval_dir() -> (PathBuf, PathBuf) {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let base = PathBuf::from(home).join(".hermesbox/approvals");
    (base.join("pending"), base.join("results"))
}

pub fn parse_approval_request(id: &str, raw_json: &str) -> Option<ApprovalRequest> {
    let v: serde_json::Value = serde_json::from_str(raw_json).ok()?;
    let tool_name = v
        .get("tool_name")
        .and_then(|t| t.as_str())
        .unwrap_or("unknown")
        .to_string();
    let command = v
        .get("tool_input")
        .and_then(|t| t.get("command"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();
    let source = match tool_name.as_str() {
        "Bash" => "claude-code",
        "terminal" => "hermes",
        _ => "unknown",
    };
    Some(ApprovalRequest {
        id: id.to_string(),
        tool_name,
        command,
        raw_json: raw_json.to_string(),
        source: source.to_string(),
    })
}

pub fn scan_pending_dir(pending_dir: &Path) -> Vec<ApprovalRequest> {
    let mut results: Vec<ApprovalRequest> = match std::fs::read_dir(pending_dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "json")
                    .unwrap_or(false)
            })
            .filter_map(|e| {
                let path = e.path();
                let id = path.file_stem()?.to_str()?.to_string();
                let raw = std::fs::read_to_string(&path).ok()?;
                parse_approval_request(&id, &raw)
            })
            .collect(),
        Err(_) => vec![],
    };
    results.sort_by(|a, b| a.id.cmp(&b.id));
    results
}

pub fn write_result_file(results_dir: &Path, id: &str, action: &str) -> Result<(), String> {
    if action != "approve" && action != "deny" {
        return Err(format!("invalid action: {action}"));
    }
    if id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err(format!("invalid approval id: {id}"));
    }
    std::fs::create_dir_all(results_dir)
        .map_err(|e| format!("failed to create results dir: {e}"))?;
    let content = serde_json::json!({"action": action}).to_string();
    let file_path = results_dir.join(format!("{id}.json"));
    let tmp_path = results_dir.join(format!("{id}.json.tmp"));
    std::fs::write(&tmp_path, &content).map_err(|e| format!("failed to write result: {e}"))?;
    std::fs::rename(&tmp_path, &file_path).map_err(|e| format!("failed to rename result: {e}"))?;
    Ok(())
}

pub fn cleanup_stale_files(dir: &Path, max_age: std::time::Duration) {
    let cutoff = std::time::SystemTime::now() - max_age;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    if modified < cutoff {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
}

pub fn start_watcher(app: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let (pending_dir, _) = approval_dir();
    std::fs::create_dir_all(&pending_dir)?;

    cleanup_stale_files(&pending_dir, std::time::Duration::from_secs(120));

    std::thread::spawn(move || {
        let app = app.clone();
        let pending_dir = pending_dir.clone();

        let callback = move |res: Result<notify::Event, notify::Error>| match res {
            Ok(event) => {
                let is_create_or_rename = matches!(
                    event.kind,
                    EventKind::Create(notify::event::CreateKind::File)
                        | EventKind::Modify(notify::event::ModifyKind::Name(
                            notify::event::RenameMode::Any
                        ))
                );
                let is_json = event
                    .paths
                    .iter()
                    .any(|p| p.extension().map(|e| e == "json").unwrap_or(false));
                if is_create_or_rename && is_json {
                    for path in &event.paths {
                        if let Some(id) = path.file_stem().and_then(|s| s.to_str()) {
                            // Brief delay to avoid reading a partially-written file.
                            // The bridge script uses write+rename, but some filesystems
                            // may emit events before rename completes.
                            std::thread::sleep(std::time::Duration::from_millis(50));
                            let raw = match std::fs::read_to_string(path) {
                                Ok(r) => r,
                                Err(_) => continue,
                            };
                            if let Some(req) = parse_approval_request(id, &raw) {
                                let _ = app.emit("approval-request", &req);
                                window::show_and_focus_main_window(&app);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("approval watcher error: {e}");
            }
        };

        let mut watcher = match RecommendedWatcher::new(callback, Config::default()) {
            Ok(w) => w,
            Err(e) => {
                log::error!("failed to create approval watcher: {e}");
                return;
            }
        };

        if let Err(e) = watcher.watch(&pending_dir, RecursiveMode::NonRecursive) {
            log::error!("failed to watch approval dir: {e}");
            return;
        }

        // Keep the thread alive for the lifetime of the app.
        // JoinHandle is intentionally dropped — watcher runs until process exit.
        std::thread::sleep(std::time::Duration::MAX);
    });

    Ok(())
}

/// Get Tauri resource directory candidates from the app handle.
fn resource_dir_candidates(app: &AppHandle) -> Vec<PathBuf> {
    use tauri::Manager;
    let mut candidates = Vec::new();
    if let Ok(path) = app.path().resource_dir() {
        candidates.push(path);
    }
    // Dev mode: compiled-in manifest path (parent of src-tauri/ = project root)
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(parent) = manifest_dir.parent() {
        candidates.push(parent.to_path_buf());
    }
    candidates
}

/// Copy bridge scripts from the project's bridge/ directory to ~/.hermesbox/bridge/.
/// This handles first-run setup where the runtime bridge directory doesn't exist yet.
fn auto_setup_bridge(bridge_dir: &str, extra_candidates: Vec<PathBuf>) -> Result<(), String> {
    let dest = PathBuf::from(bridge_dir.trim_end_matches('/'));
    std::fs::create_dir_all(&dest).map_err(|e| format!("failed to create bridge dir: {e}"))?;

    // Search order:
    // 1. Extra candidates (Tauri resource dir + CARGO_MANIFEST_DIR from caller)
    // 2. Current working directory
    // 3. Relative to current executable (production bundle)
    let mut source_candidates: Vec<Option<PathBuf>> = extra_candidates
        .into_iter()
        .map(|p| Some(p.join("bridge")))
        .collect();
    source_candidates.extend([
        std::env::current_dir().ok().map(|d| d.join("bridge")),
        std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(|p| p.join("../../bridge").to_path_buf())),
    ]);

    let source_dir = source_candidates
        .iter()
        .flatten()
        .find(|d| d.exists() && d.join("claude-code-approval-bridge.sh").exists())
        .ok_or_else(|| "no bridge/ directory found in project or executable path".to_string())?
        .clone();

    for entry in std::fs::read_dir(&source_dir).map_err(|e| format!("read bridge dir: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let src_file = entry.path();
        if src_file
            .extension()
            .is_some_and(|e| e == "sh")
        {
            let file_name = src_file.file_name().unwrap();
            let dest_file = dest.join(file_name);
            if !dest_file.exists() {
                std::fs::copy(&src_file, &dest_file)
                    .map_err(|e| format!("copy {}: {e}", file_name.to_string_lossy()))?;
                // Preserve executable permission on Unix
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(meta) = dest_file.metadata() {
                        let mut perms = meta.permissions();
                        perms.set_mode(perms.mode() | 0o755);
                        let _ = std::fs::set_permissions(&dest_file, perms);
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn setup_bridge_dir(app: AppHandle, bridge_dir: String) -> Result<(), String> {
    let resource_candidates = resource_dir_candidates(&app);
    auto_setup_bridge(&bridge_dir, resource_candidates)
}

#[tauri::command]
pub fn list_pending_approvals() -> Result<Vec<ApprovalRequest>, String> {
    let (pending_dir, _) = approval_dir();
    Ok(scan_pending_dir(&pending_dir))
}

#[tauri::command]
pub fn approve_command(id: String) -> Result<(), String> {
    let (_, results_dir) = approval_dir();
    write_result_file(&results_dir, &id, "approve")
}

#[tauri::command]
pub fn deny_command(id: String) -> Result<(), String> {
    let (_, results_dir) = approval_dir();
    write_result_file(&results_dir, &id, "deny")
}

/// Pure config generation logic, testable without AppHandle.
/// Returns a human-readable status message on success.
fn generate_approval_config_inner(
    config_type: String,
    bridge_dir: String,
    extra_candidates: Vec<PathBuf>,
) -> Result<String, String> {
    let bridge_path = Path::new(&bridge_dir);
    if !bridge_path.is_absolute() {
        return Err("bridge directory must be an absolute path".to_string());
    }
    if bridge_dir.contains('\n') {
        return Err("bridge directory path contains invalid characters".to_string());
    }

    // Verify the bridge script exists (or auto-deploy) before touching config
    let script_name = match config_type.as_str() {
        "claude" => "claude-code-approval-bridge.sh",
        "hermes" => "hermes-approval-bridge.sh",
        _ => {
            return Err(format!(
                "unknown config type: {config_type}. Use 'claude' or 'hermes'"
            ))
        }
    };
    let script_path = PathBuf::from(bridge_dir.trim_end_matches('/')).join(script_name);
    if !script_path.exists() {
        if let Err(e) = auto_setup_bridge(&bridge_dir, extra_candidates) {
            return Err(format!(
                "bridge script not found: {}. Auto-setup failed: {e}",
                script_path.display()
            ));
        }
    }

    let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
    let home_path = PathBuf::from(&home);

    match config_type.as_str() {
        "claude" => merge_claude_config(&home_path, &bridge_dir),
        "hermes" => merge_hermes_config(&home_path, &bridge_dir),
        _ => unreachable!(),
    }
}

/// Build the Claude Code hook entry for approval bridge.
fn claude_hook_entry(bridge_dir: &str) -> serde_json::Value {
    let cmd = format!("{}/claude-code-approval-bridge.sh", bridge_dir.trim_end_matches('/'));
    serde_json::json!({
        "type": "command",
        "command": cmd
    })
}

/// Build the Hermes hook entry for approval bridge.
fn hermes_hook_entry(bridge_dir: &str) -> serde_yaml::Value {
    let cmd = format!("{}/hermes-approval-bridge.sh", bridge_dir.trim_end_matches('/'));
    let mut mapping = serde_yaml::Mapping::new();
    mapping.insert(
        serde_yaml::Value::String("event".to_string()),
        serde_yaml::Value::String("pre_tool_call".to_string()),
    );
    mapping.insert(
        serde_yaml::Value::String("matcher".to_string()),
        serde_yaml::Value::String("terminal".to_string()),
    );
    mapping.insert(
        serde_yaml::Value::String("command".to_string()),
        serde_yaml::Value::String(cmd),
    );
    mapping.insert(
        serde_yaml::Value::String("timeout".to_string()),
        serde_yaml::Value::Number(120.into()),
    );
    serde_yaml::Value::Mapping(mapping)
}

/// Detect if a Claude settings JSON contains a Box-managed approval hook.
fn has_claude_approval_hook(settings: &serde_json::Value) -> bool {
    settings
        .get("hooks")
        .and_then(|h| h.get("PreToolUse"))
        .and_then(|entries| entries.as_array())
        .is_some_and(|entries| {
            entries.iter().any(|entry| {
                entry
                    .get("hooks")
                    .and_then(|hooks| hooks.as_array())
                    .is_some_and(|hooks| {
                        hooks.iter().any(|h| {
                            h.get("command")
                                .and_then(|c| c.as_str())
                                .is_some_and(|c| c.contains("claude-code-approval-bridge.sh"))
                        })
                    })
            })
        })
}

/// Detect if a Hermes config YAML contains a Box-managed approval hook.
fn has_hermes_approval_hook(config: &serde_yaml::Value) -> bool {
    config
        .get("hooks")
        .and_then(|hooks| hooks.as_sequence())
        .is_some_and(|hooks| {
            hooks.iter().any(|h| {
                h.get("command")
                    .and_then(|c| c.as_str())
                    .is_some_and(|c| c.contains("hermes-approval-bridge.sh"))
            })
        })
}

/// Backup a file with date-stamped suffix. Returns the backup path.
fn backup_file(path: &Path) -> Result<PathBuf, String> {
    let timestamp = chrono_less::now_timestamp();
    let backup = path.with_extension(format!("backup.{timestamp}"));
    std::fs::copy(path, &backup)
        .map_err(|e| format!("failed to backup {}: {e}", path.display()))?;
    Ok(backup)
}

/// Timestamp without external crates — YYYYMMDD-HHMMSS.
fn now_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    // Simple approximation: use secs for a basic timestamp string
    let secs = now.as_secs();
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
    // Unix epoch was 1970-01-01. Approximate year.
    let years_since_1970 = days / 365;
    let remaining_days = days % 365;
    let month = (remaining_days / 30).min(11) + 1;
    let day = (remaining_days % 30).min(27) + 1;
    format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}",
        1970 + years_since_1970,
        month,
        day,
        hours,
        minutes,
        seconds
    )
}

mod chrono_less {
    pub fn now_timestamp() -> String {
        super::now_timestamp()
    }
}

/// Atomic write: write to temp file then rename.
fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create parent dir: {e}"))?;
    }
    let tmp_path = path.with_extension(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| format!("{e}.hermesbox.tmp"))
            .unwrap_or_else(|| "hermesbox.tmp".to_string()),
    );
    std::fs::write(&tmp_path, content).map_err(|e| format!("failed to write config: {e}"))?;
    std::fs::rename(&tmp_path, path).map_err(|e| format!("failed to finalize config: {e}"))?;
    Ok(())
}

fn merge_claude_config(home_path: &Path, bridge_dir: &str) -> Result<String, String> {
    let target = home_path.join(".claude/settings.json");

    if !target.exists() {
        let mut settings = serde_json::json!({});
        inject_claude_hook(&mut settings, bridge_dir);
        let content = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("failed to serialize config: {e}"))?;
        atomic_write(&target, &content)?;
        return Ok("Approval hooks configured for Claude Code".to_string());
    }

    let raw = std::fs::read_to_string(&target)
        .map_err(|e| format!("failed to read {}: {e}", target.display()))?;
    let mut settings: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("failed to parse {}: {e}", target.display()))?;

    if has_claude_approval_hook(&settings) {
        // Update existing Box hook in place
        inject_claude_hook(&mut settings, bridge_dir);
        let content = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("failed to serialize config: {e}"))?;
        atomic_write(&target, &content)?;
        return Ok("Approval hooks updated for Claude Code".to_string());
    }

    // Existing config without Box hooks: backup then merge
    backup_file(&target)?;
    inject_claude_hook(&mut settings, bridge_dir);
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("failed to serialize config: {e}"))?;
    atomic_write(&target, &content)?;
    Ok("Backup created, approval hooks merged for Claude Code".to_string())
}

/// Inject or update the approval hook in a Claude settings JSON value.
fn inject_claude_hook(settings: &mut serde_json::Value, bridge_dir: &str) {
    let hook_entry = claude_hook_entry(bridge_dir);
    let new_matcher = serde_json::json!({
        "matcher": "Bash",
        "hooks": [hook_entry]
    });

    let hooks_obj = settings
        .as_object_mut()
        .expect("settings must be an object")
        .entry("hooks")
        .or_insert_with(|| serde_json::json!({}));

    let pre_tool = hooks_obj
        .as_object_mut()
        .expect("hooks must be an object")
        .entry("PreToolUse")
        .or_insert_with(|| serde_json::json!([]));

    let entries = pre_tool
        .as_array_mut()
        .expect("PreToolUse must be an array");

    // Remove existing Box-managed entry
    entries.retain(|entry| {
        entry
            .get("hooks")
            .and_then(|h| h.as_array())
            .is_none_or(|hooks| {
                !hooks
                    .iter()
                    .any(|h| h.get("command").is_some_and(|c| c.as_str().is_some_and(|s| s.contains("claude-code-approval-bridge.sh"))))
            })
    });

    entries.push(new_matcher);
}

fn merge_hermes_config(home_path: &Path, bridge_dir: &str) -> Result<String, String> {
    let target = home_path.join(".hermes/config.yaml");

    if !target.exists() {
        let mut config = serde_yaml::Value::Mapping(serde_yaml::Mapping::new());
        inject_hermes_hook(&mut config, bridge_dir);
        let content = serde_yaml::to_string(&config)
            .map_err(|e| format!("failed to serialize config: {e}"))?;
        atomic_write(&target, &content)?;
        return Ok("Approval hooks configured for Hermes".to_string());
    }

    let raw = std::fs::read_to_string(&target)
        .map_err(|e| format!("failed to read {}: {e}", target.display()))?;
    let mut config: serde_yaml::Value = serde_yaml::from_str(&raw)
        .map_err(|e| format!("failed to parse {}: {e}", target.display()))?;

    if has_hermes_approval_hook(&config) {
        inject_hermes_hook(&mut config, bridge_dir);
        let content = serde_yaml::to_string(&config)
            .map_err(|e| format!("failed to serialize config: {e}"))?;
        atomic_write(&target, &content)?;
        return Ok("Approval hooks updated for Hermes".to_string());
    }

    backup_file(&target)?;
    inject_hermes_hook(&mut config, bridge_dir);
    let content = serde_yaml::to_string(&config)
        .map_err(|e| format!("failed to serialize config: {e}"))?;
    atomic_write(&target, &content)?;
    Ok("Backup created, approval hooks merged for Hermes".to_string())
}

/// Inject or update the approval hook in a Hermes config YAML value.
fn inject_hermes_hook(config: &mut serde_yaml::Value, bridge_dir: &str) {
    let hook_entry = hermes_hook_entry(bridge_dir);

    let hooks_yaml = config
        .as_mapping_mut()
        .expect("config must be a mapping")
        .entry(serde_yaml::Value::String("hooks".to_string()))
        .or_insert_with(|| serde_yaml::Value::Sequence(vec![]));

    let entries = hooks_yaml
        .as_sequence_mut()
        .expect("hooks must be a sequence");

    // Remove existing Box-managed entry
    entries.retain(|h| {
        h.get("command")
            .and_then(|c| c.as_str())
            .is_none_or(|c| !c.contains("hermes-approval-bridge.sh"))
    });

    entries.push(hook_entry);
}

#[tauri::command]
pub fn generate_approval_config(
    app: AppHandle,
    config_type: String,
    bridge_dir: String,
) -> Result<String, String> {
    let extra = resource_dir_candidates(&app);
    generate_approval_config_inner(config_type, bridge_dir, extra)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_test_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!(
            "hermesbox-test-approval-{}-{}",
            std::process::id(),
            name
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn cleanup_test_dir(dir: &Path) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn parse_claude_code_request() {
        let json = r#"{"tool_name":"Bash","tool_input":{"command":"git push"}}"#;
        let req = parse_approval_request("test-001", json).expect("should parse");
        assert_eq!(req.tool_name, "Bash");
        assert_eq!(req.command, "git push");
        assert_eq!(req.raw_json, json);
    }

    #[test]
    fn parse_hermes_request() {
        let json = r#"{"tool_name":"terminal","tool_input":{"command":"rm -rf /tmp/test"},"session_id":"sess_001"}"#;
        let req = parse_approval_request("test-002", json).expect("should parse");
        assert_eq!(req.tool_name, "terminal");
        assert_eq!(req.command, "rm -rf /tmp/test");
        assert_eq!(req.source, "hermes");
    }

    #[test]
    fn parse_claude_code_request_detects_source() {
        let json = r#"{"tool_name":"Bash","tool_input":{"command":"git push"}}"#;
        let req = parse_approval_request("test-001", json).expect("should parse");
        assert_eq!(req.source, "claude-code");
    }

    #[test]
    fn parse_unknown_tool_name_returns_unknown_source() {
        let json = r#"{"tool_name":"Read","tool_input":{"file_path":"/tmp/foo"}}"#;
        let req = parse_approval_request("test-003", json).expect("should parse");
        assert_eq!(req.source, "unknown");
    }

    #[test]
    fn parse_invalid_json_returns_none() {
        assert!(parse_approval_request("bad", "not json").is_none());
    }

    #[test]
    fn scan_empty_pending_dir() {
        let dir = make_test_dir("empty");
        let results = scan_pending_dir(&dir);
        assert!(results.is_empty());
        cleanup_test_dir(&dir);
    }

    #[test]
    fn scan_pending_dir_finds_files() {
        let dir = make_test_dir("has-files");
        let json1 = r#"{"tool_name":"Bash","tool_input":{"command":"ls"}}"#;
        let json2 = r#"{"tool_name":"terminal","tool_input":{"command":"pwd"}}"#;
        fs::write(dir.join("approval-a.json"), json1).unwrap();
        fs::write(dir.join("hermes-b.json"), json2).unwrap();
        // Non-json file should be ignored
        fs::write(dir.join("not-json.txt"), "hello").unwrap();

        let mut results = scan_pending_dir(&dir);
        // Sort by id for deterministic assertion
        results.sort_by(|a, b| a.id.cmp(&b.id));

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].id, "approval-a");
        assert_eq!(results[0].tool_name, "Bash");
        assert_eq!(results[0].command, "ls");
        assert_eq!(results[0].source, "claude-code");
        assert_eq!(results[1].id, "hermes-b");
        assert_eq!(results[1].tool_name, "terminal");
        assert_eq!(results[1].command, "pwd");
        assert_eq!(results[1].source, "hermes");

        cleanup_test_dir(&dir);
    }

    #[test]
    fn scan_ignores_corrupt_json_files() {
        let dir = make_test_dir("corrupt-json");
        let valid = r#"{"tool_name":"Bash","tool_input":{"command":"ls"}}"#;
        fs::write(dir.join("good.json"), valid).unwrap();
        fs::write(dir.join("bad.json"), "not valid json {{{").unwrap();

        let results = scan_pending_dir(&dir);
        assert_eq!(results.len(), 1, "only valid JSON should be parsed");
        assert_eq!(results[0].id, "good");

        cleanup_test_dir(&dir);
    }

    #[test]
    fn write_result_file_creates_correct_json() {
        let dir = make_test_dir("write-result");
        write_result_file(&dir, "req-123", "approve").unwrap();

        let content = fs::read_to_string(dir.join("req-123.json")).unwrap();
        assert!(content.contains(r#""action""#));
        assert!(content.contains("approve"));
        cleanup_test_dir(&dir);
    }

    #[test]
    fn write_result_auto_creates_directory() {
        let base = make_test_dir("auto-create");
        let results_dir = base.join("nested").join("results");
        // Parent doesn't exist yet

        write_result_file(&results_dir, "req-456", "deny").unwrap();

        let content = fs::read_to_string(results_dir.join("req-456.json")).unwrap();
        assert!(content.contains("deny"));
        cleanup_test_dir(&base);
    }

    #[test]
    fn write_result_overwrites_existing() {
        let dir = make_test_dir("overwrite");
        write_result_file(&dir, "req-789", "approve").unwrap();
        // Second write with different action
        write_result_file(&dir, "req-789", "deny").unwrap();

        let content = fs::read_to_string(dir.join("req-789.json")).unwrap();
        assert!(content.contains("deny"));
        assert!(!content.contains("approve"));
        cleanup_test_dir(&dir);
    }

    // Config generation tests use a temp HOME to isolate from real filesystem.
    // Mutex prevents races on the process-global HOME env var across parallel tests.
    use std::sync::Mutex;
    static HOME_MUTEX: Mutex<()> = Mutex::new(());
    fn with_temp_home(name: &str, test: impl FnOnce(&Path)) {
        let _guard = HOME_MUTEX.lock().unwrap();
        let dir = make_test_dir(&format!("config-{name}"));
        let old = std::env::var("HOME").ok();
        std::env::set_var("HOME", &dir);
        test(&dir);
        if let Some(v) = old {
            std::env::set_var("HOME", v);
        } else {
            std::env::remove_var("HOME");
        }
        cleanup_test_dir(&dir);
    }

    fn setup_bridge_scripts(dir: &Path) -> PathBuf {
        let bridge = dir.join("bridge");
        fs::create_dir_all(&bridge).unwrap();
        fs::write(
            bridge.join("claude-code-approval-bridge.sh"),
            "#!/bin/sh\necho ok",
        )
        .unwrap();
        fs::write(
            bridge.join("hermes-approval-bridge.sh"),
            "#!/bin/sh\necho ok",
        )
        .unwrap();
        bridge
    }

    #[test]
    fn generate_claude_config_creates_valid_json_settings() {
        with_temp_home("claude", |home| {
            let bridge = setup_bridge_scripts(home);
            let result = generate_approval_config_inner(
                "claude".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(result.is_ok(), "expected Ok, got {result:?}");

            let path = home.join(".claude/settings.json");
            assert!(path.exists());
            let content = fs::read_to_string(&path).unwrap();
            assert!(content.contains("PreToolUse"));
            assert!(content.contains("Bash"));
            assert!(content.contains("claude-code-approval-bridge.sh"));
            assert!(
                content.contains(r#""type": "command""#),
                "hook must use nested format with type field"
            );
        });
    }

    #[test]
    fn generate_hermes_config_creates_yaml() {
        with_temp_home("hermes", |home| {
            let bridge = setup_bridge_scripts(home);
            let result = generate_approval_config_inner(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(result.is_ok());

            let path = home.join(".hermes/config.yaml");
            assert!(path.exists());
            let content = fs::read_to_string(&path).unwrap();
            assert!(content.contains("pre_tool_call"));
            assert!(content.contains("terminal"));
            assert!(content.contains("hermes-approval-bridge.sh"));
            // Verify YAML structure — hooks is a list of hook objects
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("YAML must be valid");
            let hooks = parsed["hooks"].as_sequence().expect("hooks must be a list");
            assert_eq!(hooks.len(), 1);
            assert_eq!(hooks[0]["matcher"].as_str(), Some("terminal"));
        });
    }

    #[test]
    fn generate_config_merges_into_existing_claude_settings() {
        with_temp_home("merge-claude", |home| {
            let bridge = setup_bridge_scripts(home);
            let claude_dir = home.join(".claude");
            fs::create_dir_all(&claude_dir).unwrap();
            // Existing settings with user data
            fs::write(
                claude_dir.join("settings.json"),
                r#"{"permissions":{"allow":["Bash(ls)"]}}"#,
            )
            .unwrap();

            let result = generate_approval_config_inner(
                "claude".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(result.is_ok(), "expected Ok, got {result:?}");

            // User data preserved + hooks injected
            let content = fs::read_to_string(claude_dir.join("settings.json")).unwrap();
            assert!(content.contains("permissions"), "user data should be preserved");
            assert!(content.contains("PreToolUse"), "hooks should be injected");
            assert!(content.contains("claude-code-approval-bridge.sh"));
            // Backup should exist
            assert!(
                claude_dir
                    .read_dir()
                    .unwrap()
                    .any(|e| e.unwrap().file_name().to_string_lossy().contains("backup")),
                "backup file should exist"
            );
        });
    }

    #[test]
    fn generate_config_rejects_unknown_type() {
        let result = generate_approval_config_inner("invalid".to_string(), "/tmp".to_string(), vec![]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown config type"));
    }

    #[test]
    fn generate_config_strips_trailing_slash_from_bridge_dir() {
        with_temp_home("trailing-slash", |home| {
            let bridge = setup_bridge_scripts(home);
            let bridge_with_slash = format!("{}/", bridge.display());
            let result = generate_approval_config_inner("claude".to_string(), bridge_with_slash, vec![]);
            assert!(result.is_ok());

            let content = fs::read_to_string(home.join(".claude/settings.json")).unwrap();
            // Should NOT have double slash
            assert!(!content.contains("//"));
        });
    }

    #[test]
    fn generate_config_rejects_missing_bridge_script() {
        with_temp_home("missing-script", |home| {
            let bridge = home.join("empty-bridge");
            fs::create_dir_all(&bridge).unwrap();
            let result = generate_approval_config_inner(
                "claude".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(result.is_err());
            assert!(result.unwrap_err().contains("bridge script not found"));
        });
    }

    #[test]
    fn write_result_rejects_path_traversal_id() {
        let dir = make_test_dir("path-traversal");
        let err = write_result_file(&dir, "../../etc/passwd", "approve").unwrap_err();
        assert!(err.contains("invalid approval id"));
        cleanup_test_dir(&dir);
    }

    #[test]
    fn generate_config_rejects_relative_path() {
        let result = generate_approval_config_inner("claude".to_string(), "relative/path".to_string(), vec![]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("absolute path"));
    }

    #[test]
    fn generate_config_rejects_newline_in_path() {
        let result =
            generate_approval_config_inner("claude".to_string(), "/path/with\nnewline".to_string(), vec![]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid characters"));
    }

    #[test]
    fn cleanup_stale_files_keeps_recent_entries() {
        let dir = make_test_dir("stale-cleanup");
        fs::write(
            dir.join("fresh.json"),
            r#"{"tool_name":"Bash","tool_input":{"command":"fresh"}}"#,
        )
        .unwrap();

        cleanup_stale_files(&dir, std::time::Duration::from_secs(120));

        assert!(
            dir.join("fresh.json").exists(),
            "recent file should survive cleanup"
        );
        cleanup_test_dir(&dir);
    }

    #[test]
    fn cleanup_stale_files_handles_empty_dir() {
        let dir = make_test_dir("stale-empty");
        cleanup_stale_files(&dir, std::time::Duration::from_secs(120));
        assert!(dir.exists());
        cleanup_test_dir(&dir);
    }

    #[test]
    fn hermes_config_accepts_path_with_colon() {
        with_temp_home("yaml-colon", |home| {
            let bridge = setup_bridge_scripts(home);
            let special_bridge = home.join("my:bridge");
            fs::create_dir_all(&special_bridge).unwrap();
            fs::write(
                special_bridge.join("hermes-approval-bridge.sh"),
                "#!/bin/sh\necho ok",
            )
            .unwrap();
            let result = generate_approval_config_inner(
                "hermes".to_string(),
                special_bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(
                result.is_ok(),
                "colon in path should be accepted: {result:?}"
            );
            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("YAML must be valid");
            let hooks = parsed["hooks"].as_sequence().expect("hooks must be a list");
            let cmd = hooks[0]["command"].as_str().unwrap();
            assert!(
                cmd.contains("my:bridge"),
                "path should round-trip through YAML: {cmd}"
            );
        });
    }

    #[test]
    fn hermes_config_accepts_path_with_hash() {
        with_temp_home("yaml-hash", |home| {
            let bridge = home.join("my#bridge");
            fs::create_dir_all(&bridge).unwrap();
            fs::write(
                bridge.join("hermes-approval-bridge.sh"),
                "#!/bin/sh\necho ok",
            )
            .unwrap();
            let result = generate_approval_config_inner(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(
                result.is_ok(),
                "hash in path should be accepted: {result:?}"
            );
            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("YAML must be valid");
            let hooks = parsed["hooks"].as_sequence().expect("hooks must be a list");
            let cmd = hooks[0]["command"].as_str().unwrap();
            assert!(
                cmd.contains("my#bridge"),
                "path should round-trip through YAML: {cmd}"
            );
        });
    }

    #[test]
    fn hermes_config_accepts_path_with_single_quotes() {
        with_temp_home("yaml-squote", |home| {
            let bridge = home.join("it's a bridge");
            fs::create_dir_all(&bridge).unwrap();
            fs::write(
                bridge.join("hermes-approval-bridge.sh"),
                "#!/bin/sh\necho ok",
            )
            .unwrap();
            let result = generate_approval_config_inner(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(
                result.is_ok(),
                "single quotes in path should be accepted: {result:?}"
            );
            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("YAML must be valid");
            let hooks = parsed["hooks"].as_sequence().expect("hooks must be a list");
            let cmd = hooks[0]["command"].as_str().unwrap();
            assert!(
                cmd.contains("it's a bridge"),
                "path should round-trip through YAML: {cmd}"
            );
        });
    }

    #[test]
    fn hermes_config_accepts_path_with_dollar_sign() {
        with_temp_home("yaml-dollar", |home| {
            let bridge = home.join("my$bridge");
            fs::create_dir_all(&bridge).unwrap();
            fs::write(
                bridge.join("hermes-approval-bridge.sh"),
                "#!/bin/sh\necho ok",
            )
            .unwrap();
            let result = generate_approval_config_inner(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(
                result.is_ok(),
                "dollar sign in path should be accepted: {result:?}"
            );
            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("YAML must be valid");
            let hooks = parsed["hooks"].as_sequence().expect("hooks must be a list");
            let cmd = hooks[0]["command"].as_str().unwrap();
            assert!(
                cmd.contains("my$bridge"),
                "path should round-trip through YAML: {cmd}"
            );
        });
    }

    #[test]
    fn hermes_config_yaml_output_is_valid() {
        with_temp_home("yaml-valid", |home| {
            let bridge = setup_bridge_scripts(home);
            let result = generate_approval_config_inner(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(result.is_ok());

            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("generated YAML should be valid");
            let hooks = parsed["hooks"].as_sequence().expect("hooks should be a list");
            assert_eq!(hooks.len(), 1);
            assert_eq!(hooks[0]["event"].as_str(), Some("pre_tool_call"));
            assert_eq!(hooks[0]["matcher"].as_str(), Some("terminal"));
        });
    }

    #[test]
    fn escape_yaml_double_quoted_handles_special_chars() {
        assert_eq!(escape_yaml_double_quoted("hello"), "hello");
        assert_eq!(
            escape_yaml_double_quoted(r#"path"with"quotes"#),
            r#"path\"with\"quotes"#
        );
        assert_eq!(
            escape_yaml_double_quoted(r#"path\with\backslash"#),
            r#"path\\with\\backslash"#
        );
        assert_eq!(escape_yaml_double_quoted("path:with:colons"), "path:with:colons");
        assert_eq!(escape_yaml_double_quoted("path#with#hash"), "path#with#hash");
        assert_eq!(escape_yaml_double_quoted("it's"), "it's");
        assert_eq!(escape_yaml_double_quoted("my$var"), "my$var");
        assert_eq!(escape_yaml_double_quoted("tab\there"), r#"tab\there"#);
        assert_eq!(escape_yaml_double_quoted("cr\rhere"), r#"cr\rhere"#);
        assert_eq!(escape_yaml_double_quoted("null\0here"), r#"null\0here"#);
    }

    #[test]
    fn write_result_rejects_invalid_action() {
        let dir = make_test_dir("invalid-action");
        let err = write_result_file(&dir, "req-1", "delete").unwrap_err();
        assert!(err.contains("invalid action"));
        cleanup_test_dir(&dir);
    }

    #[test]
    fn auto_setup_copies_scripts_from_extra_candidate() {
        let src = make_test_dir("bridge-src");
        let src_bridge = src.join("bridge");
        fs::create_dir_all(&src_bridge).unwrap();
        fs::write(
            src_bridge.join("claude-code-approval-bridge.sh"),
            "#!/bin/sh\necho src",
        )
        .unwrap();
        fs::write(
            src_bridge.join("hermes-approval-bridge.sh"),
            "#!/bin/sh\necho src",
        )
        .unwrap();

        let dest = make_test_dir("bridge-dest");
        auto_setup_bridge(dest.to_string_lossy().as_ref(), vec![src.clone()]).unwrap();

        assert!(dest.join("claude-code-approval-bridge.sh").exists());
        assert!(dest.join("hermes-approval-bridge.sh").exists());
        let content = fs::read_to_string(dest.join("claude-code-approval-bridge.sh")).unwrap();
        assert_eq!(content, "#!/bin/sh\necho src");

        cleanup_test_dir(&src);
        cleanup_test_dir(&dest);
    }

    #[test]
    fn auto_setup_fails_with_no_candidates() {
        let dest = make_test_dir("bridge-dest-nocand");
        let result = auto_setup_bridge(dest.to_string_lossy().as_ref(), vec![]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no bridge/ directory found"));
        cleanup_test_dir(&dest);
    }

    #[test]
    fn generate_config_auto_deploys_bridge_from_candidates() {
        with_temp_home("auto-deploy", |home| {
            // Source bridge directory
            let src = home.join("project-root");
            let src_bridge = src.join("bridge");
            fs::create_dir_all(&src_bridge).unwrap();
            fs::write(
                src_bridge.join("claude-code-approval-bridge.sh"),
                "#!/bin/sh\necho deployed",
            )
            .unwrap();
            fs::write(
                src_bridge.join("hermes-approval-bridge.sh"),
                "#!/bin/sh\necho deployed",
            )
            .unwrap();

            // Destination bridge dir (empty)
            let dest_bridge = home.join("runtime-bridge");
            fs::create_dir_all(&dest_bridge).unwrap();

            let result = generate_approval_config_inner(
                "claude".to_string(),
                dest_bridge.to_string_lossy().to_string(),
                vec![src],
            );
            assert!(result.is_ok(), "auto-deploy should succeed: {result:?}");

            // Verify the script was deployed
            assert!(
                dest_bridge.join("claude-code-approval-bridge.sh").exists(),
                "script should be auto-deployed"
            );
            assert!(
                home.join(".claude/settings.json").exists(),
                "config should be generated"
            );
        });
    }

    #[test]
    fn claude_config_updates_existing_box_hook() {
        with_temp_home("claude-update", |home| {
            let bridge = setup_bridge_scripts(home);
            // First generation
            let r1 = generate_approval_config_inner(
                "claude".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(r1.is_ok());

            // Second generation — should update, not error
            let r2 = generate_approval_config_inner(
                "claude".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(r2.is_ok(), "second run should succeed: {r2:?}");
            assert!(
                r2.unwrap().contains("updated"),
                "message should mention update"
            );

            // Verify no backup created (since it's an update, not first merge)
            let claude_dir = home.join(".claude");
            let has_backup = claude_dir
                .read_dir()
                .unwrap()
                .any(|e| e.unwrap().file_name().to_string_lossy().contains("backup"));
            assert!(!has_backup, "no backup needed for update");
        });
    }

    #[test]
    fn hermes_config_merges_into_existing_yaml() {
        with_temp_home("hermes-merge", |home| {
            let bridge = setup_bridge_scripts(home);
            let hermes_dir = home.join(".hermes");
            fs::create_dir_all(&hermes_dir).unwrap();
            // Existing config with user data
            fs::write(
                hermes_dir.join("config.yaml"),
                "model:\n  default: test-model\nterminal:\n  backend: local\n",
            )
            .unwrap();

            let result = generate_approval_config_inner(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(result.is_ok(), "merge should succeed: {result:?}");

            let content = fs::read_to_string(hermes_dir.join("config.yaml")).unwrap();
            // User data preserved
            assert!(content.contains("test-model"), "user data should be preserved");
            // Hook injected
            assert!(
                content.contains("hermes-approval-bridge.sh"),
                "hook should be injected"
            );
        });
    }

    #[test]
    fn hermes_config_updates_existing_box_hook() {
        with_temp_home("hermes-update", |home| {
            let bridge = setup_bridge_scripts(home);
            // First generation
            let r1 = generate_approval_config_inner(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(r1.is_ok());

            // Second generation — should update
            let r2 = generate_approval_config_inner(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
                vec![],
            );
            assert!(r2.is_ok(), "second run should succeed: {r2:?}");
            assert!(r2.unwrap().contains("updated"));

            // Verify only one hook entry (not duplicated)
            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("YAML must be valid");
            let hooks = parsed["hooks"].as_sequence().expect("hooks must be a list");
            assert_eq!(hooks.len(), 1, "hook should not be duplicated");
        });
    }
}