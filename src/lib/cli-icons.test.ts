import { describe, it, expect } from "vitest";
import { CLI_ICONS } from "./cli-icons";

describe("cli-icons", () => {
  it("maps known CLI ids to icon paths", () => {
    expect(CLI_ICONS.heremes).toBeUndefined();
    expect(CLI_ICONS.hermes).toBe("/icons/hermes-agent-light.png");
    expect(CLI_ICONS.claude).toBe("/icons/claude-ai-iconpng.png");
    expect(CLI_ICONS.codex).toBe("/icons/codex-color.png");
    expect(CLI_ICONS.openclaw).toBe("/icons/openclaw-color.png");
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
    expect(ids).toContain("shell");
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });
});
