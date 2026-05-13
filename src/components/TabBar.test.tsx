import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { TabBar, type TabInfo } from "./TabBar";

const tabs: TabInfo[] = [
  { id: "tab-1", cliId: "hermes", title: "Hermes", command: "hermes" },
  { id: "tab-2", cliId: "claude", title: "Claude Code", command: "claude" },
];

const defaultProps = {
  settingsActive: false,
  onSettings: vi.fn(),
  onSettingsClose: vi.fn(),
  onToggleLock: vi.fn(),
  onRename: vi.fn(),
  onColorChange: vi.fn(),
  onCopyTitle: vi.fn(),
  onCloseOtherTabs: vi.fn(),
  onOpenExternalTerminal: vi.fn(),
};

describe("TabBar", () => {
  it("renders all tabs with titles", () => {
    render(<TabBar tabs={tabs} activeId="tab-1" onSwitch={vi.fn()} onClose={vi.fn()} onAdd={vi.fn()} {...defaultProps} />);

    expect(screen.getByText("Hermes")).not.toBeNull();
    expect(screen.getByText("Claude Code")).not.toBeNull();
  });

  it("renders CLI icons", () => {
    render(<TabBar tabs={tabs} activeId="tab-1" onSwitch={vi.fn()} onClose={vi.fn()} onAdd={vi.fn()} {...defaultProps} />);

    const hermesImg = screen.getByAltText("hermes") as HTMLImageElement;
    const claudeImg = screen.getByAltText("claude") as HTMLImageElement;
    expect(hermesImg.src).toContain("/icons/hermes-agent-light.png");
    expect(claudeImg.src).toContain("/icons/claude-ai-iconpng.png");
  });

  it("calls onSwitch when clicking a tab", () => {
    const onSwitch = vi.fn();
    render(<TabBar tabs={tabs} activeId="tab-1" onSwitch={onSwitch} onClose={vi.fn()} onAdd={vi.fn()} {...defaultProps} />);

    fireEvent.click(screen.getByText("Claude Code"));
    expect(onSwitch).toHaveBeenCalledWith("tab-2");
  });

  it("calls onClose when clicking close button", () => {
    const onClose = vi.fn();
    render(<TabBar tabs={tabs} activeId="tab-1" onSwitch={vi.fn()} onClose={onClose} onAdd={vi.fn()} {...defaultProps} />);

    const closeButtons = screen.getAllByText("×");
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledWith("tab-1");
  });

  it("calls onAdd when clicking add button", () => {
    const onAdd = vi.fn();
    render(<TabBar tabs={tabs} activeId="tab-1" onSwitch={vi.fn()} onClose={vi.fn()} onAdd={onAdd} {...defaultProps} />);

    fireEvent.click(screen.getByLabelText("Open new tab"));
    expect(onAdd).toHaveBeenCalled();
  });

  it("renders with empty tabs", () => {
    render(<TabBar tabs={[]} activeId={null} onSwitch={vi.fn()} onClose={vi.fn()} onAdd={vi.fn()} {...defaultProps} />);

    expect(screen.getByLabelText("Open new tab")).not.toBeNull();
  });
});
