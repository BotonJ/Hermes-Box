import { useRef, useEffect } from "preact/hooks";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { spawn } from "tauri-pty";

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    let disposed = false;

    requestAnimationFrame(() => {
      if (disposed) {
        term.dispose();
        return;
      }

      try {
        fitAddon.fit();
      } catch {
        // Container may have zero size during mount
      }

      const pty = spawn("/bin/zsh", [], {
        cols: term.cols,
        rows: term.rows,
        env: { TERM: "xterm-256color" },
      });

      pty.onData((data: unknown) => {
        const bytes = data instanceof Uint8Array
          ? data
          : new Uint8Array(data as number[]);
        term.write(bytes);
      });

      term.onData((data: string) => {
        pty.write(data);
      });

      term.onResize((e: { cols: number; rows: number }) => {
        pty.resize(e.cols, e.rows);
      });

      pty.onExit(({ exitCode }: { exitCode: number }) => {
        term.write(`\r\n\r\n[Process exited with code ${exitCode}]\r\n`);
      });
    });

    return () => {
      disposed = true;
      term.dispose();
    };
  }, []);

  return (
    <div style="width: 100vw; height: 100vh; background: #000;">
      <div ref={containerRef} style="width: 100%; height: 100%;" />
    </div>
  );
}
