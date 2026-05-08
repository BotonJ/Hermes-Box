import { useRef, useEffect, useCallback } from "preact/hooks";

export interface TabMetrics {
  id: string;
  title: string;
  isActive: boolean;
  bytesIn: number;
  bytesPerSec: number;
  bufferLines: number;
  scrollback: number;
  cols: number;
  rows: number;
  renderActive: boolean;
}

export interface DebugState {
  tabs: TabMetrics[];
  totalBytesPerSec: number;
  tabCount: number;
}

type Listener = (state: DebugState) => void;

const listeners = new Set<Listener>();
let globalState: DebugState = { tabs: [], totalBytesPerSec: 0, tabCount: 0 };

function notify() {
  for (const fn of listeners) fn(globalState);
}

export function useDebugMetrics() {
  const stateRef = useRef(globalState);

  useEffect(() => {
    const handler = (s: DebugState) => { stateRef.current = s; };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const getState = useCallback(() => stateRef.current, []);
  return getState;
}

// Called by TerminalView to register metrics
export function updateTabMetrics(id: string, metrics: Partial<TabMetrics>) {
  const existing = globalState.tabs.find((t) => t.id === id);
  if (existing) {
    Object.assign(existing, metrics);
  } else {
    globalState.tabs.push({ id, title: "", isActive: false, bytesIn: 0, bytesPerSec: 0, bufferLines: 0, scrollback: 0, cols: 0, rows: 0, renderActive: true, ...metrics });
  }
  globalState.totalBytesPerSec = globalState.tabs.reduce((s, t) => s + t.bytesPerSec, 0);
  globalState.tabCount = globalState.tabs.length;
  notify();
}

export function removeTabMetrics(id: string) {
  globalState.tabs = globalState.tabs.filter((t) => t.id !== id);
  globalState.totalBytesPerSec = globalState.tabs.reduce((s, t) => s + t.bytesPerSec, 0);
  globalState.tabCount = globalState.tabs.length;
  notify();
}

// Byte rate tracker - returns a function to call on each data chunk
export function createByteRateTracker(onUpdate: (bytesPerSec: number, totalBytes: number) => void) {
  let totalBytes = 0;
  let windowBytes = 0;
  let windowStart = performance.now();

  return (chunkSize: number) => {
    totalBytes += chunkSize;
    windowBytes += chunkSize;

    const now = performance.now();
    const elapsed = now - windowStart;
    if (elapsed >= 1000) {
      const bps = (windowBytes / elapsed) * 1000;
      windowBytes = 0;
      windowStart = now;
      onUpdate(bps, totalBytes);
    }
  };
}
