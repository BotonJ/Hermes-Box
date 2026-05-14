import { describe, it, expect } from "vitest";
import { CLI_ICONS, getCLIIcon } from "./cli-icons";

describe("cli-icons", () => {
  it("maps known CLI ids to icon paths", () => {
    expect(CLI_ICONS.heremes).toBeUndefined();
    expect(CLI_ICONS.hermes).toBe("/icons/hermes-agent-light.png");
    expect(CLI_ICONS.claude).toBe("/icons/claude-ai-iconpng.png");
    expect(CLI_ICONS.codex).toBe("/icons/codex-color.png");
    expect(CLI_ICONS.openclaw).toBe("/icons/openclaw-color.png");
    expect(CLI_ICONS.deepseek).toBe("/icons/deepseek-color.png");
    expect(CLI_ICONS.shell).toBe("/icons/macos-terminal-256.png");
  });

  it("all icon paths start with /icons/", () => {
    for (const path of Object.values(CLI_ICONS)) {
      expect(path).toMatch(/^\/icons\//);
    }
  });

  it("contains expected set of CLI ids", () => {
    const ids = Object.keys(CLI_ICONS);
    expect(ids).toContain("hermes");
    expect(ids).toContain("claude");
    expect(ids).toContain("deepseek");
    expect(ids).toContain("shell");
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });
});

describe("getCLIIcon", () => {
  it("returns icon by id for system CLIs", () => {
    expect(getCLIIcon("hermes")).toBe("/icons/hermes-agent-light.png");
    expect(getCLIIcon("claude")).toBe("/icons/claude-ai-iconpng.png");
  });

  it("returns icon by command name for custom CLIs", () => {
    expect(getCLIIcon("custom-abc", "hermes")).toBe("/icons/hermes-agent-light.png");
    expect(getCLIIcon("custom-xyz", "/opt/homebrew/bin/codex")).toBe("/icons/codex-color.png");
  });

  it("returns icon by label fallback for custom CLIs", () => {
    expect(getCLIIcon("custom-abc", "something", "Hermes Agent")).toBe("/icons/hermes-agent-light.png");
    expect(getCLIIcon("custom-xyz", "unknown", "My Codex")).toBe("/icons/codex-color.png");
    expect(getCLIIcon("custom-abc", "unknown", "DeepSeek TUI")).toBe("/icons/deepseek-color.png");
  });

  it("returns shell icon as fallback", () => {
    expect(getCLIIcon("custom-abc", "unknown", "Random Tool")).toBe("/icons/macos-terminal-256.png");
  });
});
