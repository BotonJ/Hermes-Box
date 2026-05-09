import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { TerminalView } from "./TerminalView";

// ── vi.hoisted: must run before vi.mock ─────────────────────────────

let resizeCallback: ResizeObserverCallback | null = null;

const { mockOpen, mockFitAddonFit, MockTerminal, MockFitAddon, MockPty } =
  vi.hoisted(() => {
    const mockOpen = vi.fn();
    const mockFitAddonFit = vi.fn();

    class MockTerminal {
      open = vi.fn((container: HTMLElement) => {
        mockOpen(container);
        this.element = container;
      });
      write = vi.fn();
      focus = vi.fn();
      dispose = vi.fn();
      onData = vi.fn();
      onResize = vi.fn();
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
      onData = vi.fn();
      onExit = vi.fn();
      write = vi.fn();
      resize = vi.fn();
      kill = vi.fn();
    }

    return { mockOpen, mockFitAddonFit, MockTerminal, MockFitAddon, MockPty };
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
vi.mock("../lib/use-terminal-fit", () => ({ useTerminalFit: () => {} }));
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
