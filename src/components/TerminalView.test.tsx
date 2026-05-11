import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { TerminalView } from "./TerminalView";

// ── vi.hoisted: must run before vi.mock ─────────────────────────────

let resizeCallback: ResizeObserverCallback | null = null;

const { mockOpen, mockFitAddonFit, MockTerminal, MockFitAddon, MockPty, lastSpawnedPty, getOnResizeHandler } =
  vi.hoisted(() => {
    const mockOpen = vi.fn();
    const mockFitAddonFit = vi.fn();
    let _lastSpawnedPty: any = null;
    let _onResizeHandler: ((e: { cols: number; rows: number }) => void) | null = null;

    class MockTerminal {
      open = vi.fn((container: HTMLElement) => {
        mockOpen(container);
        this.element = container;
      });
      write = vi.fn();
      focus = vi.fn();
      dispose = vi.fn();
      onData = vi.fn();
      onResize = vi.fn((cb: (e: { cols: number; rows: number }) => void) => {
        _onResizeHandler = cb;
        return { dispose: vi.fn() };
      });
      loadAddon = vi.fn();
      cols = 80;
      rows = 24;
      element = null as HTMLElement | null;
      buffer = { active: { length: 24 } };
      options = { fontSize: 14, scrollback: 1000 };
    }

    class MockFitAddon {
      fit = mockFitAddonFit;
    }

    class MockPty {
      onData: any;
      onExit = vi.fn();
      write = vi.fn();
      resize = vi.fn().mockResolvedValue(undefined);
      kill = vi.fn();
      constructor() {
        this.onData = vi.fn((cb: any) => {
          cb(new Uint8Array([]));
          return { dispose: vi.fn() };
        });
        _lastSpawnedPty = this;
      }
    }

    return {
      mockOpen,
      mockFitAddonFit,
      MockTerminal,
      MockFitAddon,
      MockPty,
      lastSpawnedPty: () => _lastSpawnedPty,
      getOnResizeHandler: () => _onResizeHandler,
    };
  });

// ── ResizeObserver mock ─────────────────────────────────────────────

function installROMock() {
  globalThis.ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) {
      resizeCallback = cb;
    }
    observe() {}
    disconnect() {}
    unobserve() {}
  } as any;
}

installROMock();

// ── Module mocks ────────────────────────────────────────────────────

vi.mock("@xterm/xterm", () => ({ Terminal: MockTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: MockFitAddon }));
vi.mock("../lib/pty", () => ({ spawn: () => new MockPty() }));
vi.mock("../lib/use-terminal-fit", () => ({ useTerminalFit: () => ({ scheduleFit: vi.fn() }) }));
vi.mock("../lib/validate-command", () => ({
  validateCommandPath: vi.fn(),
  escapeForPty: vi.fn(),
}));
vi.mock("../lib/schedule-command", () => ({ scheduleCommand: vi.fn() }));
vi.mock("../lib/debug-metrics", () => ({
  updateTabMetrics: vi.fn(),
  removeTabMetrics: vi.fn(),
  createByteRateTracker: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock("../lib/theme", () => ({ getTheme: () => "dark" }));
vi.mock("../lib/xterm-themes", () => ({ getXtermTheme: () => ({}) }));
vi.mock("./TerminalView.module.css", () => ({
  default: { terminal: "terminal" },
}));

// ── Helpers ─────────────────────────────────────────────────────────

function fireResize(width: number, height: number) {
  resizeCallback?.(
    [{ contentRect: { width, height } } as ResizeObserverEntry],
    {} as ResizeObserver,
  );
}

// ── Tests ───────────────────────────────────────────────────────────

describe("TerminalView — term.open() timing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeCallback = null;
    installROMock();
  });

  // 核心测试 1: ResizeObserver 回调不使用 requestAnimationFrame
  // 修复前: FAIL (rAF 被调用)
  // 修复后: PASS (rAF 未被调用)
  it("ResizeObserver callback executes synchronously without requestAnimationFrame", () => {
    // Mock rAF to record calls WITHOUT executing the callback
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockReturnValue(1);

    render(
      <TerminalView
        tabId="t1"
        shell="/bin/bash"
        shellArgs={[]}
        isActive={true}
      />,
    );

    fireResize(800, 600);

    // requestAnimationFrame should NOT be called by the observer
    expect(rafSpy).not.toHaveBeenCalled();

    // But term.open() and fitAddon.fit() should have been called synchronously
    expect(mockOpen).toHaveBeenCalled();
    expect(mockFitAddonFit).toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  // 核心测试 2: term.open() 在 observer 回调内同步执行
  // 修复前: FAIL (term.open 在 rAF 回调中，不在 observer 回调栈内)
  // 修复后: PASS (term.open 在 observer 回调内同步调用)
  it("term.open() is called synchronously inside the ResizeObserver callback", () => {
    let openCalledInObserver = false;

    // Wrap mockOpen to detect if it's called during the observer callback
    mockOpen.mockImplementation((_container: HTMLElement) => {
      openCalledInObserver = true;
    });

    const OrigRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = (entries, obs) => {
          // Call the real observer callback, then check if open was called
          openCalledInObserver = false;
          cb(entries, obs);
          // If open was called synchronously within cb, this will be true
        };
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    } as any;

    render(
      <TerminalView
        tabId="t1"
        shell="/bin/bash"
        shellArgs={[]}
        isActive={true}
      />,
    );

    // Fire resize and check if open was called within the observer callback
    openCalledInObserver = false;
    resizeCallback?.(
      [{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(openCalledInObserver).toBe(true);

    globalThis.ResizeObserver = OrigRO;
  });

  // 核心测试 3: fitAddon.fit() 在 observer 回调内同步执行
  // 修复前: FAIL (fit 在 rAF 回调中)
  // 修复后: PASS (fit 在 observer 回调内同步调用)
  it("fitAddon.fit() is called synchronously inside the ResizeObserver callback", () => {
    let fitCalledInObserver = false;

    mockFitAddonFit.mockImplementation(() => {
      fitCalledInObserver = true;
    });

    const OrigRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = (entries, obs) => {
          fitCalledInObserver = false;
          cb(entries, obs);
        };
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    } as any;

    render(
      <TerminalView
        tabId="t1"
        shell="/bin/bash"
        shellArgs={[]}
        isActive={true}
      />,
    );

    fitCalledInObserver = false;
    resizeCallback?.(
      [{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );

    expect(fitCalledInObserver).toBe(true);

    globalThis.ResizeObserver = OrigRO;
  });

  // 辅助测试: 零尺寸不触发 observer open
  it("does NOT open terminal when ResizeObserver fires with zero dimensions", () => {
    render(
      <TerminalView
        tabId="t1"
        shell="/bin/bash"
        shellArgs={[]}
        isActive={true}
      />,
    );

    // Clear calls from useLayoutEffect during render
    mockOpen.mockClear();

    fireResize(0, 0);

    expect(mockOpen).not.toHaveBeenCalled();
  });

  // 辅助测试: 非活跃 tab 不触发 observer open
  it("does NOT open terminal in observer when tab is inactive", () => {
    render(
      <TerminalView
        tabId="t1"
        shell="/bin/bash"
        shellArgs={[]}
        isActive={false}
      />,
    );

    fireResize(800, 600);

    expect(mockOpen).not.toHaveBeenCalled();
  });
});

describe("TerminalView — resize dedup (lastResize guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeCallback = null;
    installROMock();
  });

  function renderActiveAndOpen() {
    render(
      <TerminalView
        tabId="t1"
        shell="/bin/bash"
        shellArgs={[]}
        isActive={true}
      />,
    );

    // Fire resize observer to trigger term.open() + spawnPty
    fireResize(800, 600);

    return lastSpawnedPty()!;
  }

  it("same-size onResize fires pty.resize only once", () => {
    const pty = renderActiveAndOpen();
    pty.resize.mockClear();

    const onResize = getOnResizeHandler();
    expect(onResize).not.toBeNull();
    onResize!({ cols: 100, rows: 30 });
    onResize!({ cols: 100, rows: 30 });

    // With lastResize guard: should only call resize once
    expect(pty.resize).toHaveBeenCalledTimes(1);
    expect(pty.resize).toHaveBeenCalledWith(100, 30);
  });

  it("different sizes each trigger pty.resize", () => {
    const pty = renderActiveAndOpen();
    pty.resize.mockClear();

    const onResize = getOnResizeHandler();
    onResize!({ cols: 100, rows: 30 });
    onResize!({ cols: 120, rows: 40 });
    onResize!({ cols: 80, rows: 25 });

    expect(pty.resize).toHaveBeenCalledTimes(3);
  });

  it("mix of same and different sizes dedupes correctly", () => {
    const pty = renderActiveAndOpen();
    pty.resize.mockClear();

    const onResize = getOnResizeHandler();
    onResize!({ cols: 100, rows: 30 });
    onResize!({ cols: 100, rows: 30 }); // duplicate — skip
    onResize!({ cols: 120, rows: 40 }); // different — fire
    onResize!({ cols: 120, rows: 40 }); // duplicate — skip
    onResize!({ cols: 100, rows: 30 }); // different — fire

    expect(pty.resize).toHaveBeenCalledTimes(3);
  });
});
