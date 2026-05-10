use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{ipc::Channel, AppHandle, Emitter, Manager};

// ── PTY Session ──────────────────────────────────────────────

pub(crate) struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child_killer: Box<dyn ChildKiller + Send + Sync>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub(crate) type PtyMap = Arc<Mutex<HashMap<String, PtySession>>>;

// ── Events pushed to frontend via Channel ────────────────────

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum PtyEvent {
    #[serde(rename = "data")]
    Data { session_id: String, data: Vec<u8> },
    #[serde(rename = "exit")]
    Exit { session_id: String, code: i32 },
}

// ── Commands ─────────────────────────────────────────────────

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    sessions: tauri::State<'_, PtyMap>,
    session_id: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    exec_command: String,
    cwd: String,
    cols: u16,
    rows: u16,
    on_event: Channel<PtyEvent>,
) -> Result<u32, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {e}"))?;

    let mut cmd = CommandBuilder::new(&command);
    if exec_command.is_empty() {
        cmd.args(&args);
    } else {
        // Spawn login shell with -c "exec <command>" to avoid echo of command path
        cmd.args(&args);
        cmd.arg("-c");
        cmd.arg(format!("exec {exec_command}"));
    }
    cmd.cwd(&cwd);
    for (key, value) in &env {
        cmd.env(key, value);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn failed: {e}"))?;

    let pid = child.process_id().unwrap_or(0);
    let child_killer = child.clone_killer();

    // Spawn a thread to read PTY output and push via Channel
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone reader failed: {e}"))?;

    let sid_reader = session_id.clone();
    let app_reader = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let event = PtyEvent::Data {
                        session_id: sid_reader.clone(),
                        data: buf[..n].to_vec(),
                    };
                    let _ = on_event.send(event.clone());
                    let _ = app_reader.emit("pty-event", event);
                }
                Err(_) => break,
            }
        }
        let event = PtyEvent::Exit {
            session_id: sid_reader.clone(),
            code: 0,
        };
        let _ = on_event.send(event.clone());
        let _ = app_reader.emit("pty-event", event);
    });

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take writer failed: {e}"))?;

    let session = PtySession {
        writer,
        master: pair.master,
        child_killer,
        _child: child,
    };

    sessions.lock().unwrap().insert(session_id, session);

    Ok(pid)
}

#[tauri::command]
pub async fn pty_write(
    sessions: tauri::State<'_, PtyMap>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut map = sessions.lock().unwrap();
    let session = map
        .get_mut(&session_id)
        .ok_or_else(|| format!("session {session_id} not found"))?;
    session
        .writer
        .write_all(&data)
        .map_err(|e| format!("write failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn pty_resize(
    sessions: tauri::State<'_, PtyMap>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = sessions.lock().unwrap();
    let session = map
        .get(&session_id)
        .ok_or_else(|| format!("session {session_id} not found"))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn pty_kill(
    sessions: tauri::State<'_, PtyMap>,
    session_id: String,
) -> Result<(), String> {
    let mut map = sessions.lock().unwrap();
    if let Some(mut session) = map.remove(&session_id) {
        session
            .child_killer
            .kill()
            .map_err(|e| format!("kill failed: {e}"))?;
    }
    Ok(())
}

// ── State setup helper ───────────────────────────────────────

pub fn manage_pty_state(app: &tauri::App) {
    app.manage(Arc::new(Mutex::new(HashMap::<String, PtySession>::new())));
}
