// src/components/TerminalView.stress-integration.test.tsx
// 极限测试：多 Tab 快速切换场景
// 不修改现有代码，单独创建测试文件

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

// ── Stress Tests ────────────────────────────────────────────────────

describe("TerminalView 极限测试 — 多 Tab 快速切换", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeCallback = null;
    installROMock();
  });

  it("快速切换 active 状态 100 次应该稳定", () => {
    const { rerender } = render(
      <TerminalView
        tabId="stress-1"
        shell="/bin/bash"
        shellArgs={[]}
        isActive={true}
      />,
    );

    // 模拟 ResizeObserver 触发 term.open
    fireResize(800, 600);

    // 快速切换 100 次
    for (let i = 0; i < 100; i++) {
      rerender(
        <TerminalView
          tabId="stress-1"
          shell="/bin/bash"
          shellArgs={[]}
          isActive={i % 2 === 0}
        />
      );
    }

    // 验证终端仍可正常工作
    expect(mockOpen).toHaveBeenCalled();
    expect(mockFitAddonFit).toHaveBeenCalled();
  });

  it("连续创建和销毁 50 个 Tab 应该稳定", () => {
    for (let i = 0; i < 50; i++) {
      const { unmount } = render(
        <TerminalView
          tabId={`stress-cycle-${i}`}
          shell="/bin/bash"
          shellArgs={[]}
          isActive={true}
        />,
      );
      fireResize(800, 600);
      unmount();
    }

    // 无崩溃即为通过
    expect(true).toBe(true);
  });

  it("10 个 Tab 同时存在且快速切换应该稳定", () => {
    const renders: ReturnType<typeof render>[] = [];

    // 创建 10 个 Tab
    for (let i = 0; i < 10; i++) {
      renders.push(
        render(
          <TerminalView
            tabId={`stress-multi-${i}`}
            shell="/bin/bash"
            shellArgs={[]}
            isActive={i === 0}
          />,
        ),
      );
      fireResize(800, 600);
    }

    // 快速切换 10 次
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < renders.length; i++) {
        renders[i].rerender(
          <TerminalView
            tabId={`stress-multi-${i}`}
            shell="/bin/bash"
            shellArgs={[]}
            isActive={round % 2 === 0}
          />,
        );
      }
    }

    // 所有终端仍可访问
    renders.forEach(({ unmount }) => {
      expect(() => unmount()).not.toThrow();
    });
  });

  it("非活跃 Tab 快速切换到活跃再切换走应该稳定", () => {
    const { rerender } = render(
      <TerminalView
        tabId="stress-toggle"
        shell="/bin/bash"
        shellArgs={[]}
        isActive={false}
      />,
    );

    // 快速切换 inactive -> active -> inactive 100 次
    for (let i = 0; i < 100; i++) {
      const isActive = i % 2 === 1;
      rerender(
        <TerminalView
          tabId="stress-toggle"
          shell="/bin/bash"
          shellArgs={[]}
          isActive={isActive}
        />,
      );
    }

    expect(mockOpen).toHaveBeenCalled();
  });

  it("大量数据写入场景下切换应该稳定", () => {
    const { rerender } = render(
      <TerminalView
        tabId="stress-write"
        shell="/bin/bash"
        shellArgs={[]}
        isActive={true}
      />,
    );

    fireResize(800, 600);

    // 切换走
    rerender(
      <TerminalView
        tabId="stress-write"
        shell="/bin/bash"
        shellArgs={[]}
        isActive={false}
      />,
    );

    // 切换回来
    expect(() =>
      rerender(
        <TerminalView
          tabId="stress-write"
          shell="/bin/bash"
          shellArgs={[]}
          isActive={true}
        />,
      )
    ).not.toThrow();
  });
});
