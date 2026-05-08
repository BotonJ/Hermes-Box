import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/preact";

vi.mock("@xterm/addon-fit", () => ({}));

import { useTerminalFit } from "./use-terminal-fit";

function createMockFitAddon() {
  return {
    fit: vi.fn(),
    proposeDimensions: vi.fn().mockReturnValue({ cols: 80, rows: 24 }),
  };
}

function createMockContainer(width = 800, height = 600) {
  return {
    getBoundingClientRect: vi.fn().mockReturnValue({ width, height }),
  } as unknown as HTMLElement;
}

// jsdom doesn't implement ResizeObserver
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as any;
}

describe("useTerminalFit", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call fit() on mount — mount fit is handled by TerminalView", async () => {
    const fitAddon = createMockFitAddon();
    const container = createMockContainer();

    renderHook(() =>
      useTerminalFit({
        containerRef: { current: container },
        fitAddonRef: { current: fitAddon as any },
      }),
    );

    await vi.runAllTimersAsync();

    // Hook only handles ongoing resize, not initial mount
    expect(fitAddon.fit).not.toHaveBeenCalled();
  });

  it("does not call fit() when proposeDimensions returns tiny values", async () => {
    const fitAddon = createMockFitAddon();
    fitAddon.proposeDimensions.mockReturnValue({ cols: 1, rows: 1 });
    const container = createMockContainer();

    renderHook(() =>
      useTerminalFit({
        containerRef: { current: container },
        fitAddonRef: { current: fitAddon as any },
      }),
    );

    await vi.runAllTimersAsync();

    expect(fitAddon.fit).not.toHaveBeenCalled();
  });

  it("does not call fit() when fitAddon is null", async () => {
    const container = createMockContainer();

    renderHook(() =>
      useTerminalFit({
        containerRef: { current: container },
        fitAddonRef: { current: null },
      }),
    );

    await vi.runAllTimersAsync();

    // Should not throw
  });

  it("cleans up observers on unmount", async () => {
    const fitAddon = createMockFitAddon();
    const container = createMockContainer();
    const disconnectSpy = vi.fn();
    const observeSpy = vi.fn();

    const OriginalRO = window.ResizeObserver;
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    window.ResizeObserver = class {
      observe = observeSpy;
      disconnect = disconnectSpy;
      unobserve = vi.fn();
    } as any;

    const { unmount } = renderHook(() =>
      useTerminalFit({
        containerRef: { current: container },
        fitAddonRef: { current: fitAddon as any },
      }),
    );

    expect(observeSpy).toHaveBeenCalledWith(container);

    unmount();

    expect(disconnectSpy).toHaveBeenCalled();

    window.ResizeObserver = OriginalRO;
  });

  it("debounces fit calls via setTimeout cancellation", async () => {
    const fitAddon = createMockFitAddon();
    const container = createMockContainer();

    renderHook(() =>
      useTerminalFit({
        containerRef: { current: container },
        fitAddonRef: { current: fitAddon as any },
      }),
    );

    // Flush mount
    await vi.runAllTimersAsync();
    fitAddon.fit.mockClear();

    // Simulate rapid resize events
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));

    await vi.runAllTimersAsync();

    // Should only fit once (setTimeout cancellation deduplicates)
    expect(fitAddon.fit).toHaveBeenCalledTimes(1);
  });

  it("delays fit by 100ms debounce", async () => {
    const fitAddon = createMockFitAddon();
    const container = createMockContainer();

    renderHook(() =>
      useTerminalFit({
        containerRef: { current: container },
        fitAddonRef: { current: fitAddon as any },
      }),
    );

    await vi.runAllTimersAsync();
    fitAddon.fit.mockClear();

    window.dispatchEvent(new Event("resize"));

    // Before debounce fires
    vi.advanceTimersByTime(50);
    expect(fitAddon.fit).not.toHaveBeenCalled();

    // After debounce fires
    vi.advanceTimersByTime(60);
    expect(fitAddon.fit).toHaveBeenCalledTimes(1);
  });
});
