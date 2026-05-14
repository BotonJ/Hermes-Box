import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { CLISelector } from "./CLISelector";
import type { DetectResult } from "../lib/cli-detect";

const mockResults: DetectResult[] = [
  { id: "hermes", found: true, path: "/usr/local/bin/hermes" },
  { id: "claude", found: true, path: "/usr/local/bin/claude" },
];

const partialResults: DetectResult[] = [
  { id: "hermes", found: true, path: "/usr/local/bin/hermes" },
  { id: "claude", found: false, path: null, error: "Claude Code not found" },
];

describe("CLISelector", () => {
  it("renders a card for each found CLI", () => {
    render(<CLISelector results={mockResults} onSelect={vi.fn()} />);

    expect(screen.getByText("Hermes")).not.toBeNull();
    expect(screen.getByText("Claude Code")).not.toBeNull();
  });

  it("shows description for each CLI", () => {
    render(<CLISelector results={mockResults} onSelect={vi.fn()} />);

    expect(screen.getByText("AI 助手")).not.toBeNull();
    expect(screen.getByText("编程助手")).not.toBeNull();
  });

  it("calls onSelect with id and path when a found card is clicked", () => {
    const onSelect = vi.fn();
    render(<CLISelector results={mockResults} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Hermes"));
    expect(onSelect).toHaveBeenCalledWith("hermes", "/usr/local/bin/hermes");
  });

  it("shows all CLI cards even when not detected", () => {
    render(<CLISelector results={partialResults} onSelect={vi.fn()} />);

    expect(screen.getByText("Claude Code")).not.toBeNull();
    expect(screen.getByText("Hermes")).not.toBeNull();
  });

  it("renders Shell card that is always enabled", () => {
    render(<CLISelector results={mockResults} onSelect={vi.fn()} />);

    expect(screen.getByText("Shell")).not.toBeNull();
    const shellButton = screen.getByText("Shell").closest("button");
    expect(shellButton?.disabled).toBe(false);
  });

  it("calls onSelect with shell id and /bin/zsh when Shell is clicked", () => {
    const onSelect = vi.fn();
    render(<CLISelector results={mockResults} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Shell"));
    expect(onSelect).toHaveBeenCalledWith("shell", "/bin/zsh");
  });
});
