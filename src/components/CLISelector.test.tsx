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
  it("renders a card for each CLI in results", () => {
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

  it("marks not-found CLI cards as disabled via button attribute", () => {
    render(<CLISelector results={partialResults} onSelect={vi.fn()} />);

    const claudeButton = screen.getByText("Claude Code").closest("button");
    expect(claudeButton?.disabled).toBe(true);
  });

  it("shows error message for not-found CLI", () => {
    render(<CLISelector results={partialResults} onSelect={vi.fn()} />);

    expect(screen.getByText(/Claude Code not found/i)).not.toBeNull();
  });

  it("does not call onSelect when disabled card is clicked", () => {
    const onSelect = vi.fn();
    render(<CLISelector results={partialResults} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Claude Code"));
    expect(onSelect).not.toHaveBeenCalled();
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
