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

/// Copy bridge scripts from the project's bridge/ directory to ~/.hermesbox/bridge/.
/// This handles first-run setup where the runtime bridge directory doesn't exist yet.
fn auto_setup_bridge(bridge_dir: &str) -> Result<(), String> {
    let dest = PathBuf::from(bridge_dir.trim_end_matches('/'));
    std::fs::create_dir_all(&dest).map_err(|e| format!("failed to create bridge dir: {e}"))?;

    // Development mode: copy from project root bridge/ directory
    // Look relative to the executable, then fall back to CWD
    let source_candidates = [
        std::env::current_dir().ok().map(|d| d.join("bridge")),
        std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(|p| p.join("../../bridge").to_path_buf())),
    ];

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
pub fn setup_bridge_dir(bridge_dir: String) -> Result<(), String> {
    auto_setup_bridge(&bridge_dir)
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

#[tauri::command]
pub fn generate_approval_config(config_type: String, bridge_dir: String) -> Result<(), String> {
    let bridge_path = Path::new(&bridge_dir);
    if !bridge_path.is_absolute() {
        return Err("bridge directory must be an absolute path".to_string());
    }
    if bridge_dir.contains('\n') {
        return Err("bridge directory path contains invalid characters".to_string());
    }

    let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
    let home_path = PathBuf::from(&home);

    let (target_path, content) = match config_type.as_str() {
        "claude" => {
            let path = home_path.join(".claude/settings.json");
            let template = serde_json::json!({
                "hooks": {
                    "PreToolUse": [{
                        "matcher": "Bash",
                        "hooks": [{
                            "type": "command",
                            "command": format!("{}/claude-code-approval-bridge.sh", bridge_dir.trim_end_matches('/'))
                        }]
                    }]
                }
            });
            (
                path,
                serde_json::to_string_pretty(&template)
                    .map_err(|e| format!("failed to serialize config: {e}"))?,
            )
        }
        "hermes" => {
            let path = home_path.join(".hermes/config.yaml");
            let cmd = format!(
                "{}/hermes-approval-bridge.sh",
                bridge_dir.trim_end_matches('/')
            );
            let template = serde_json::json!({
                "hooks": {
                    "pre_tool_call": [{
                        "matcher": "terminal",
                        "command": cmd,
                    }]
                }
            });
            let content = serde_yaml::to_string(&template)
                .map_err(|e| format!("failed to serialize YAML config: {e}"))?;
            (path, content)
        }
        _ => {
            return Err(format!(
                "unknown config type: {config_type}. Use 'claude' or 'hermes'"
            ))
        }
    };

    // Verify the bridge script exists before generating config
    let script_name = match config_type.as_str() {
        "claude" => "claude-code-approval-bridge.sh",
        "hermes" => "hermes-approval-bridge.sh",
        _ => unreachable!(),
    };
    let script_path = PathBuf::from(bridge_dir.trim_end_matches('/')).join(script_name);
    if !script_path.exists() {
        // Try to auto-setup: copy bridge scripts from project directory
        if let Err(e) = auto_setup_bridge(&bridge_dir) {
            return Err(format!(
                "bridge script not found: {}. Auto-setup failed: {e}",
                script_path.display()
            ));
        }
    }

    if target_path.exists() {
        return Err(format!(
            "{} already exists. Please merge the approval config manually.",
            target_path.display()
        ));
    }

    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("failed to create parent dir: {e}"))?;
    }

    let tmp_path = target_path.with_extension(
        target_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!("{e}.hermesbox.tmp"))
            .unwrap_or_else(|| "hermesbox.tmp".to_string()),
    );

    std::fs::write(&tmp_path, &content).map_err(|e| format!("failed to write config: {e}"))?;
    std::fs::rename(&tmp_path, &target_path)
        .map_err(|e| format!("failed to finalize config: {e}"))?;

    Ok(())
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
            let result = generate_approval_config(
                "claude".to_string(),
                bridge.to_string_lossy().to_string(),
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
            let result = generate_approval_config(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
            );
            assert!(result.is_ok());

            let path = home.join(".hermes/config.yaml");
            assert!(path.exists());
            let content = fs::read_to_string(&path).unwrap();
            assert!(content.contains("pre_tool_call"));
            assert!(content.contains("terminal"));
            assert!(content.contains("hermes-approval-bridge.sh"));
        });
    }

    #[test]
    fn generate_config_refuses_overwrite() {
        with_temp_home("overwrite", |home| {
            let bridge = setup_bridge_scripts(home);
            let claude_dir = home.join(".claude");
            fs::create_dir_all(&claude_dir).unwrap();
            fs::write(claude_dir.join("settings.json"), "existing").unwrap();

            let result = generate_approval_config(
                "claude".to_string(),
                bridge.to_string_lossy().to_string(),
            );
            assert!(result.is_err());
            assert!(result.unwrap_err().contains("already exists"));
        });
    }

    #[test]
    fn generate_config_rejects_unknown_type() {
        let result = generate_approval_config("invalid".to_string(), "/tmp".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown config type"));
    }

    #[test]
    fn generate_config_strips_trailing_slash_from_bridge_dir() {
        with_temp_home("trailing-slash", |home| {
            let bridge = setup_bridge_scripts(home);
            let bridge_with_slash = format!("{}/", bridge.display());
            let result = generate_approval_config("claude".to_string(), bridge_with_slash);
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
            let result = generate_approval_config(
                "claude".to_string(),
                bridge.to_string_lossy().to_string(),
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
        let result = generate_approval_config("claude".to_string(), "relative/path".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("absolute path"));
    }

    #[test]
    fn generate_config_rejects_newline_in_path() {
        let result =
            generate_approval_config("claude".to_string(), "/path/with\nnewline".to_string());
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
            let result = generate_approval_config(
                "hermes".to_string(),
                special_bridge.to_string_lossy().to_string(),
            );
            assert!(
                result.is_ok(),
                "colon in path should be accepted: {result:?}"
            );
            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("YAML must be valid");
            let cmd = parsed["hooks"]["pre_tool_call"][0]["command"]
                .as_str()
                .unwrap();
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
            let result = generate_approval_config(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
            );
            assert!(
                result.is_ok(),
                "hash in path should be accepted: {result:?}"
            );
            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("YAML must be valid");
            let cmd = parsed["hooks"]["pre_tool_call"][0]["command"]
                .as_str()
                .unwrap();
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
            let result = generate_approval_config(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
            );
            assert!(
                result.is_ok(),
                "single quotes in path should be accepted: {result:?}"
            );
            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("YAML must be valid");
            let cmd = parsed["hooks"]["pre_tool_call"][0]["command"]
                .as_str()
                .unwrap();
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
            let result = generate_approval_config(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
            );
            assert!(
                result.is_ok(),
                "dollar sign in path should be accepted: {result:?}"
            );
            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("YAML must be valid");
            let cmd = parsed["hooks"]["pre_tool_call"][0]["command"]
                .as_str()
                .unwrap();
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
            let result = generate_approval_config(
                "hermes".to_string(),
                bridge.to_string_lossy().to_string(),
            );
            assert!(result.is_ok());

            let content = fs::read_to_string(home.join(".hermes/config.yaml")).unwrap();
            // Verify the YAML can be parsed back
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(&content).expect("generated YAML should be valid");
            let hooks = parsed.get("hooks").expect("should have hooks key");
            let pre_tool_call = hooks
                .get("pre_tool_call")
                .expect("should have pre_tool_call");
            assert!(pre_tool_call.is_sequence());
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
}