import { useRef, useState, useEffect, useLayoutEffect } from "preact/hooks";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { spawn } from "../lib/pty";

// zsh PROMPT_SP: \e[1m\e[7m%\e[27m\e[1m\e[0m + spaces + \r \r
// eslint-disable-next-line no-control-regex -- ANSI escape sequences are required for terminal prompt detection
const PROMPT_SP_RE = /\x1b\[1m\x1b\[7m%\x1b\[27m\x1b\[1m\x1b\[0m[^\x0d]*\x0d \x0d/;

const hiddenTerminalStyle: Record<string, string> = {
  visibility: "hidden",
  pointerEvents: "none",
};

import { useTerminalFit } from "../lib/use-terminal-fit";
import { getTheme } from "../lib/theme";
import { getXtermTheme } from "../lib/xterm-themes";
import { updateTabMetrics, removeTabMetrics, createByteRateTracker } from "../lib/debug-metrics";
import styles from "./TerminalView.module.css";

interface TerminalViewProps {
  tabId: string;
  tabTitle?: string;
  shell: string;
  shellArgs: string[];
  env?: Record<string, string>;
  command?: string;
  isActive?: boolean;
  onExit?: (code: number) => void;
}

export function TerminalView({ tabId, tabTitle, shell, shellArgs, env, command, isActive = true, onExit }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const ptyRef = useRef<ReturnType<typeof spawn> | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const activeRef = useRef(isActive);
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const pendingDataRef = useRef<{ chunks: Uint8Array[]; bytes: number }>({ chunks: [], bytes: 0 });
  const promptSpStripped = useRef(false);
  const spawnPtyFnRef = useRef<(() => void) | null>(null);
  const ptyDisposedRef = useRef(false);
  const [fontSize, setFontSize] = useState(14);

  const { scheduleFit } = useTerminalFit({
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
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      scheduleFit();
    }
  }, [fontSize, scheduleFit]);

  // Create terminal, open when container is visible AND tab is active
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

    termRef.current = term;
    fitRef.current = fitAddon;

    function spawnPty() {
      if (ptyRef.current || !term.element) return;

      console.log(`[DEBUG-TV] ${tabId} spawnPty: cols=${term.cols} rows=${term.rows}`);
      const spawnEnv = { TERM: "xterm-256color", ...(env ?? {}) };
      const pty = spawn(shell, shellArgs, {
        cols: term.cols,
        rows: term.rows,
        env: spawnEnv,
        execCommand: command || undefined,
      });
      ptyRef.current = pty;
      lastResizeRef.current = { cols: term.cols, rows: term.rows };

      let ptyReady = false;
      ptyDisposedRef.current = false;
      const pendingWrites: string[] = [];

      const trackBytes = createByteRateTracker((bps, total) => {
        updateTabMetrics(tabId, { bytesPerSec: bps, bytesIn: total });
      });

      const MAX_PENDING = 512 * 1024;

      pty.onData((data: unknown) => {
        if (ptyDisposedRef.current) return;
        let bytes = data instanceof Uint8Array
          ? data
          : new Uint8Array(data as number[]);

        // Strip zsh PROMPT_SP marker from first output chunk
        if (!promptSpStripped.current) {
          const text = new TextDecoder().decode(bytes);
          const stripped = text.replace(PROMPT_SP_RE, "");
          if (stripped !== text) {
            promptSpStripped.current = true;
            bytes = new TextEncoder().encode(stripped);
          }
        }

        trackBytes(bytes.length);
        if (activeRef.current) {
          term.write(bytes);
        } else {
          const buf = pendingDataRef.current;
          buf.chunks.push(bytes);
          buf.bytes += bytes.length;
          while (buf.bytes > MAX_PENDING && buf.chunks.length > 1) {
            buf.bytes -= buf.chunks.shift()!.length;
          }
        }
        if (!ptyReady) {
          ptyReady = true;
          for (const pending of pendingWrites) {
            pty.write(pending);
          }
          pendingWrites.length = 0;
        }
      });

      term.onData((data: string) => {
        if (ptyReady) {
          pty.write(data);
        } else {
          pendingWrites.push(data);
        }
      });

      term.onResize((e: { cols: number; rows: number }) => {
        if (!ptyReady) return;
        if (lastResizeRef.current &&
            e.cols === lastResizeRef.current.cols &&
            e.rows === lastResizeRef.current.rows) {
          return;
        }
        lastResizeRef.current = { cols: e.cols, rows: e.rows };
        pty.resize(e.cols, e.rows).catch(() => {});
      });

      pty.onExit(({ exitCode }: { exitCode: number }) => {
        if (ptyDisposedRef.current) return;
        term.write(`\r\n\r\n[Process exited with code ${exitCode}]\r\n`);
        pendingWrites.length = 0;
        pendingDataRef.current = { chunks: [], bytes: 0 };
        onExitRef.current?.(exitCode);
      });
    }

    spawnPtyFnRef.current = spawnPty;

    // Open terminal when container has non-zero dimensions AND tab is active.
    // Only the active tab should open at mount time; inactive tabs open on activation.
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const canOpen = width > 0 && height > 0 && !term.element && activeRef.current;
      console.log(`[DEBUG-TV] ${tabId} observer: ${width}x${height} hasElement=${!!term.element} active=${activeRef.current} canOpen=${canOpen}`);
      if (canOpen) {
        term.open(container);
        try { fitAddon.fit(); } catch { /* ignore */ }
        console.log(`[DEBUG-TV] ${tabId} observer opened: cols=${term.cols} rows=${term.rows}`);
        spawnPty();
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      spawnPtyFnRef.current = null;
      ptyDisposedRef.current = true;
      if (ptyRef.current) {
        ptyRef.current.kill();
      }
      term.dispose();
      termRef.current = null;
      ptyRef.current = null;
      lastResizeRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell, shellArgs, command]);

  // Track renderer paused state for metrics
  const renderPausedRef = useRef(false);

  // Register tab metrics and periodic update
  useEffect(() => {
    updateTabMetrics(tabId, { title: tabTitle || tabId, isActive, renderActive: isActive });

    const interval = setInterval(() => {
      const term = termRef.current;
      if (!term) return;
      updateTabMetrics(tabId, {
        isActive,
        bufferLines: term.buffer.active.length,
        scrollback: term.options.scrollback ?? 0,
        cols: term.cols,
        rows: term.rows,
        renderActive: !renderPausedRef.current,
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      removeTabMetrics(tabId);
    };
  }, [tabId, tabTitle, isActive]);

  // Pause/resume renderer on tab toggle, open terminal if needed
  useLayoutEffect(() => {
    activeRef.current = isActive;
    const term = termRef.current;
    const container = containerRef.current;
    console.log(`[DEBUG-TV] ${tabId} isActive=${isActive} hasTerm=${!!term} hasContainer=${!!container} hasElement=${!!term?.element} hasPty=${!!ptyRef.current}`);
    if (!term || !container) return;

    if (isActive) {
      // Open terminal if not yet opened (was inactive when ResizeObserver ran)
      if (!term.element) {
        console.log(`[DEBUG-TV] ${tabId} useLayoutEffect opening terminal`);
        term.open(container);
      }

      // Re-fit when becoming active (container may have resized while hidden)
      const fitAddon = fitRef.current;
      if (fitAddon) {
        try { fitAddon.fit(); } catch { /* zero-size container */ }
      }
      console.log(`[DEBUG-TV] ${tabId} useLayoutEffect fit: cols=${term.cols} rows=${term.rows}`);

      // Spawn PTY if terminal is open but PTY not yet spawned
      if (!ptyRef.current && term.element) {
        console.log(`[DEBUG-TV] ${tabId} useLayoutEffect spawning PTY`);
        spawnPtyFnRef.current?.();
      }

      // Flush buffered data and resume renderer
      renderPausedRef.current = false;
      const buf = pendingDataRef.current;
      if (buf.chunks.length > 0) {
        for (const chunk of buf.chunks) {
          term.write(chunk);
        }
        buf.chunks = [];
        buf.bytes = 0;
      }
      term.focus();
    } else {
      renderPausedRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tabId is stable per component instance (key={tab.id})
  }, [isActive]);

  // Respond to theme changes
  useEffect(() => {
    if (!termRef.current) return;

    const observer = new MutationObserver(() => {
      const term = termRef.current;
      if (!term) return;
      const t = document.documentElement.dataset.theme;
      if (t === "light" || t === "dark") {
        term.options.theme = getXtermTheme(t);
      }
    });

    const observerOptions: MutationObserverInit = { attributes: true, attributeFilter: ["data-theme"] };
    observer.observe(document.documentElement, observerOptions);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      class={styles.terminal}
      style={isActive ? undefined : hiddenTerminalStyle}
    />
  );
}
