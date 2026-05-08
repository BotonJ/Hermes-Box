import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { TabBar, type TabInfo } from "./TabBar";

const tabs: TabInfo[] = [
  { id: "tab-1", cliId: "hermes", title: "Hermes" },
  { id: "tab-2", cliId: "claude", title: "Claude Code" },
];

describe("TabBar", () => {
  it("renders all tabs with titles", () => {
    render(<TabBar tabs={tabs} activeId="tab-1" settingsActive={false} onSwitch={vi.fn()} onClose={vi.fn()} onAdd={vi.fn()} onSettings={vi.fn()} onSettingsClose={vi.fn()} />);

    expect(screen.getByText("Hermes")).not.toBeNull();
    expect(screen.getByText("Claude Code")).not.toBeNull();
  });

  it("renders CLI icons", () => {
    render(<TabBar tabs={tabs} activeId="tab-1" settingsActive={false} onSwitch={vi.fn()} onClose={vi.fn()} onAdd={vi.fn()} onSettings={vi.fn()} onSettingsClose={vi.fn()} />);

    expect(screen.getByText("⚡")).not.toBeNull();
    expect(screen.getByText("🤖")).not.toBeNull();
  });

  it("renders Settings tab", () => {
    render(<TabBar tabs={tabs} activeId="tab-1" settingsActive={false} onSwitch={vi.fn()} onClose={vi.fn()} onAdd={vi.fn()} onSettings={vi.fn()} onSettingsClose={vi.fn()} />);

    expect(screen.getByText("⚙️")).not.toBeNull();
    expect(screen.getByText("Settings")).not.toBeNull();
  });

  it("calls onSwitch when clicking a tab", () => {
    const onSwitch = vi.fn();
    render(<TabBar tabs={tabs} activeId="tab-1" settingsActive={false} onSwitch={onSwitch} onClose={vi.fn()} onAdd={vi.fn()} onSettings={vi.fn()} onSettingsClose={vi.fn()} />);

    fireEvent.click(screen.getByText("Claude Code"));
    expect(onSwitch).toHaveBeenCalledWith("tab-2");
  });

  it("calls onClose when clicking close button", () => {
    const onClose = vi.fn();
    render(<TabBar tabs={tabs} activeId="tab-1" settingsActive={false} onSwitch={vi.fn()} onClose={onClose} onAdd={vi.fn()} onSettings={vi.fn()} onSettingsClose={vi.fn()} />);

    const closeButtons = screen.getAllByText("×");
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledWith("tab-1");
  });

  it("calls onAdd when clicking add button", () => {
    const onAdd = vi.fn();
    render(<TabBar tabs={tabs} activeId="tab-1" settingsActive={false} onSwitch={vi.fn()} onClose={vi.fn()} onAdd={onAdd} onSettings={vi.fn()} onSettingsClose={vi.fn()} />);

    fireEvent.click(screen.getByTitle("Open new tab"));
    expect(onAdd).toHaveBeenCalled();
  });

  it("renders with empty tabs", () => {
    render(<TabBar tabs={[]} activeId={null} settingsActive={false} onSwitch={vi.fn()} onClose={vi.fn()} onAdd={vi.fn()} onSettings={vi.fn()} onSettingsClose={vi.fn()} />);

    expect(screen.getByTitle("Open new tab")).not.toBeNull();
  });

  it("calls onSettings when clicking Settings tab", () => {
    const onSettings = vi.fn();
    render(<TabBar tabs={tabs} activeId="tab-1" settingsActive={false} onSwitch={vi.fn()} onClose={vi.fn()} onAdd={vi.fn()} onSettings={onSettings} onSettingsClose={vi.fn()} />);

    fireEvent.click(screen.getByText("Settings"));
    expect(onSettings).toHaveBeenCalled();
  });

  it("renders Settings tab with active style when settingsActive is true", () => {
    render(<TabBar tabs={tabs} activeId={null} settingsActive={true} onSwitch={vi.fn()} onClose={vi.fn()} onAdd={vi.fn()} onSettings={vi.fn()} onSettingsClose={vi.fn()} />);

    const settingsTab = screen.getByText("Settings").closest("button");
    expect(settingsTab?.className).toContain("active");
  });
});
