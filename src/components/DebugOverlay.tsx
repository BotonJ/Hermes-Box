import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { useDebugMetrics, type DebugState } from "../lib/debug-metrics";

interface LogEntry {
  ts: number;
  elapsed: number;
  tabs: DebugState["tabs"];
  totalBps: number;
}

export function DebugOverlay() {
  const [visible, setVisible] = useState(false);
  const getMetrics = useDebugMetrics();
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const logRef = useRef<LogEntry[]>([]);
  const startRef = useRef(0);

  const exportLog = useCallback(async () => {
    const log = logRef.current;
    if (log.length === 0) return;

    const payload = {
      exportedAt: new Date().toISOString(),
      durationMs: log.length > 0 ? log[log.length - 1].elapsed : 0,
      samples: log.length,
      log,
    };

    const json = JSON.stringify(payload, null, 2);
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    return json;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setVisible((v) => {
          if (v) {
            // Turning off → auto-export
            exportLog();
          } else {
            // Turning on → reset log
            logRef.current = [];
            startRef.current = performance.now();
          }
          return !v;
        });
      }
      if (e.ctrlKey && e.shiftKey && e.key === "E") {
        e.preventDefault();
        exportLog();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [exportLog]);

  // Periodic sampling
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      const m = getMetrics();
      logRef.current.push({
        ts: Date.now(),
        elapsed: performance.now() - startRef.current,
        tabs: m.tabs.map((t) => ({ ...t })),
        totalBps: m.totalBytesPerSec,
      });
    }, 500);
    return () => clearInterval(id);
  }, [visible, getMetrics]);

  if (!visible) return null;

  const m = getMetrics();

  return (
    <div style={overlayStyle}>
      <div style={headerStyle}>
        DEBUG — {m.tabCount} tabs — {formatBps(m.totalBytesPerSec)} total — {logRef.current.length} samples
        <span style={{ opacity: 0.5, marginLeft: 8 }}>Ctrl+Shift+D close &amp; export</span>
        {copied && <span style={{ color: "#0f0", marginLeft: 8 }}>copied!</span>}
      </div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Tab</th>
            <th style={thStyle}>Active</th>
            <th style={thStyle}>Bytes/s</th>
            <th style={thStyle}>Total</th>
            <th style={thStyle}>Buffer</th>
            <th style={thStyle}>Size</th>
            <th style={thStyle}>Render</th>
          </tr>
        </thead>
        <tbody>
          {m.tabs.map((t) => (
            <tr key={t.id} style={t.isActive ? activeRowStyle : undefined}>
              <td style={tdStyle}>{t.title || t.id.slice(0, 8)}</td>
              <td style={tdStyle}>{t.isActive ? "YES" : "hidden"}</td>
              <td style={tdStyle}>{formatBps(t.bytesPerSec)}</td>
              <td style={tdStyle}>{formatBytes(t.bytesIn)}</td>
              <td style={tdStyle}>{t.bufferLines}L</td>
              <td style={tdStyle}>{t.cols}x{t.rows}</td>
              <td style={tdStyle}>{t.renderActive ? "ON" : "OFF"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <span style={{ display: "none" }}>{tick}</span>
    </div>
  );
}

function formatBps(bps: number): string {
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  return `${(bps / 1024).toFixed(1)} KB/s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const overlayStyle: Record<string, string> = {
  position: "fixed",
  top: "4px",
  right: "4px",
  zIndex: "9999",
  background: "rgba(0, 0, 0, 0.85)",
  color: "#0f0",
  fontFamily: "monospace",
  fontSize: "11px",
  padding: "8px",
  borderRadius: "6px",
  minWidth: "480px",
  pointerEvents: "auto",
  userSelect: "text",
};

const headerStyle: Record<string, string> = {
  marginBottom: "4px",
  color: "#ff0",
  fontWeight: "bold",
};

const tableStyle: Record<string, string> = {
  borderCollapse: "collapse",
  width: "100%",
};

const thStyle: Record<string, string> = {
  textAlign: "left",
  padding: "2px 6px",
  borderBottom: "1px solid #333",
  color: "#888",
};

const tdStyle: Record<string, string> = {
  padding: "2px 6px",
  whiteSpace: "nowrap",
};

const activeRowStyle: Record<string, string> = {
  color: "#0f0",
};
