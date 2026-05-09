import { invoke, Channel } from "@tauri-apps/api/core";

// ── Event emitter (compatible with tauri-pty's EventEmitter2) ──

type Listener<T> = (data: T) => void;

class EventEmitter<T> {
  private listeners: Listener<T>[] = [];

  get event(): (listener: Listener<T>) => { dispose: () => void } {
    return (listener) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          const idx = this.listeners.indexOf(listener);
          if (idx >= 0) this.listeners.splice(idx, 1);
        },
      };
    };
  }

  fire(data: T): void {
    for (const listener of [...this.listeners]) {
      listener(data);
    }
  }
}

// ── PTY interface (matches tauri-pty's spawn() return) ────────

interface PtyInstance {
  pid: number | undefined;
  onData: (listener: (data: unknown) => void) => { dispose: () => void };
  onExit: (listener: (data: { exitCode: number }) => void) => { dispose: () => void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

interface SpawnOptions {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  cwd?: string;
}

interface PtyEventMsg {
  event: string;
  data: { session_id: string; data?: number[]; code?: number };
}

// ── spawn() — drop-in replacement for tauri-pty's spawn ──────

export function spawn(
  file: string,
  args?: string | string[],
  options?: SpawnOptions,
): PtyInstance {
  const onDataEmitter = new EventEmitter<unknown>();
  const onExitEmitter = new EventEmitter<{ exitCode: number }>();

  const sessionId = `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const argsArr = typeof args === "string" ? [args] : args ?? [];

  const onEvent = new Channel<PtyEventMsg>();

  onEvent.onmessage = (msg) => {
    if (msg.event === "data" && msg.data.data) {
      onDataEmitter.fire(new Uint8Array(msg.data.data));
    } else if (msg.event === "exit") {
      onExitEmitter.fire({ exitCode: msg.data.code ?? 0 });
    }
  };

  const initPromise = invoke<number>("pty_spawn", {
    sessionId,
    command: file,
    args: argsArr,
    cwd: options?.cwd ?? "/tmp",
    cols: options?.cols ?? 80,
    rows: options?.rows ?? 24,
    onEvent,
  });

  let pid: number | undefined;

  initPromise.then((p) => {
    pid = p;
  }).catch((e) => {
    console.error("[pty] spawn failed:", e);
  });

  return {
    get pid() {
      return pid;
    },
    onData: onDataEmitter.event,
    onExit: onExitEmitter.event,
    write(data: string) {
      invoke("pty_write", {
        sessionId,
        data: Array.from(new TextEncoder().encode(data)),
      }).catch((e) => console.error("[pty] write error:", e));
    },
    resize(cols: number, rows: number) {
      invoke("pty_resize", { sessionId, cols, rows }).catch((e) =>
        console.error("[pty] resize error:", e),
      );
    },
    kill(_signal?: string) {
      invoke("pty_kill", { sessionId }).catch(() => {});
    },
  };
}
