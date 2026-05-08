import { useRef, useState, useEffect } from "preact/hooks";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { spawn } from "tauri-pty";
import { validateCommandPath, escapeForPty } from "../lib/validate-command";
import { scheduleCommand } from "../lib/schedule-command";
import { useTerminalFit } from "../lib/use-terminal-fit";
import { getTheme } from "../lib/theme";
import { getXtermTheme } from "../lib/xterm-themes";
import styles from "./TerminalView.module.css";

interface TerminalViewProps {
  shell: string;
  shellArgs: string[];
  env?: Record<string, string>;
  command?: string;
  isActive?: boolean;
  onExit?: (code: number) => void;
}

export function TerminalView({ shell, shellArgs, env, command, isActive = true, onExit }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const ptyRef = useRef<ReturnType<typeof spawn> | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const cancelCommandRef = useRef<(() => void) | null>(null);
  const [fontSize, setFontSize] = useState(14);

  useTerminalFit({
    containerRef,
    fitAddonRef: fitRef,
  });

  // Keyboard zoom: Ctrl+Plus/Minus to adjust font size 6-72px
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setFontSize((s) => Math.min(s + 2, 72));
      } else if (e.key === "-") {
        e.preventDefault();
        setFontSize((s) => Math.max(s - 2, 6));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync fontSize to terminal and re-fit
  useEffect(() => {
    if (termRef.current && fitRef.current) {
      termRef.current.options.fontSize = fontSize;
      fitRef.current.fit();
    }
  }, [fontSize]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      allowTransparency: true,
      theme: getXtermTheme(getTheme()),
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    let disposed = false;
    let pty: ReturnType<typeof spawn> | null = null;
    let lastResize: { cols: number; rows: number } | null = null;

    requestAnimationFrame(() => {
      if (disposed) {
        term.dispose();
        return;
      }

      try {
        fitAddon.fit();
      } catch {
        // Container may have zero size during mount (inactive tab)
      }

      const spawnEnv = { TERM: "xterm-256color", ...(env ?? {}) };
      pty = spawn(shell, shellArgs, {
        cols: term.cols,
        rows: term.rows,
        env: spawnEnv,
      });
      lastResize = { cols: term.cols, rows: term.rows };

      // Buffer keystrokes until the shell sends its first output,
      // indicating termios and terminal modes are fully initialized.
      // Without this, modified keys (e.g. Shift+?) can be lost or
      // misinterpreted during the shell's startup phase.
      let ptyReady = false;
      const pendingWrites: string[] = [];

      pty.onData((data: unknown) => {
        const bytes = data instanceof Uint8Array
          ? data
          : new Uint8Array(data as number[]);
        term.write(bytes);
        if (!ptyReady) {
          ptyReady = true;
          for (const pending of pendingWrites) {
            pty!.write(pending);
          }
          pendingWrites.length = 0;
        }
      });

      term.onData((data: string) => {
        if (ptyReady) {
          pty!.write(data);
        } else {
          pendingWrites.push(data);
        }
      });

      term.onResize((e: { cols: number; rows: number }) => {
        if (lastResize && e.cols === lastResize.cols && e.rows === lastResize.rows) {
          return;
        }
        lastResize = { cols: e.cols, rows: e.rows };
        pty!.resize(e.cols, e.rows);
      });

      pty.onExit(({ exitCode }: { exitCode: number }) => {
        term.write(`\r\n\r\n[Process exited with code ${exitCode}]\r\n`);
        onExitRef.current?.(exitCode);
      });

      if (command) {
        cancelCommandRef.current = scheduleCommand(
          pty,
          term,
          command,
          validateCommandPath,
          escapeForPty,
        );
      }

      termRef.current = term;
      ptyRef.current = pty;
      fitRef.current = fitAddon;
    });

    return () => {
      disposed = true;
      cancelCommandRef.current?.();
      if (pty) {
        pty.kill();
      }
      term.dispose();
      termRef.current = null;
      ptyRef.current = null;
      fitRef.current = null;
      cancelCommandRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell, shellArgs, command]);

  // Respond to theme changes
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const observer = new MutationObserver(() => {
      const t = document.documentElement.dataset.theme;
      if (t === "light" || t === "dark") {
        term.options.theme = getXtermTheme(t);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      class={styles.terminal}
      style={isActive ? undefined : { visibility: "hidden", pointerEvents: "none" }}
    />
  );
}
