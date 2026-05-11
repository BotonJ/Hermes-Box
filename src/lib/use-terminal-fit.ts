import { useRef, useEffect, useCallback } from "preact/hooks";
import type { FitAddon } from "@xterm/addon-fit";

const MIN_COLS = 2;
const MIN_ROWS = 2;
const DEBOUNCE_MS = 100;

interface UseTerminalFitOptions {
  containerRef: { current: HTMLElement | null };
  fitAddonRef: { current: FitAddon | null };
}

export function useTerminalFit({ containerRef, fitAddonRef }: UseTerminalFitOptions) {
  const timerRef = useRef(0);

  const scheduleFit = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      try {
        const fitAddon = fitAddonRef.current;
        if (!fitAddon) return;
        const dims = fitAddon.proposeDimensions?.();
        if (dims && dims.cols >= MIN_COLS && dims.rows >= MIN_ROWS) {
          fitAddon.fit();
        }
      } catch {
        // Ignore fit errors during transitions
      }
    }, DEBOUNCE_MS);
  }, [fitAddonRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    window.addEventListener("resize", scheduleFit);

    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("resize", scheduleFit);
      observer.disconnect();
    };
  }, [containerRef, scheduleFit]);

  return { scheduleFit };
}
