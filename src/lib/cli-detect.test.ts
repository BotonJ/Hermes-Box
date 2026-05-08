import { describe, it, expect } from "vitest";
import {
  type CLIMeta,
  type DetectResult,
  detectCLI,
  detectAllCLIs,
} from "./cli-detect";

const hermesMeta: CLIMeta = {
  id: "hermes",
  label: "Hermes",
  description: "AI 助手",
  commands: ["hermes"],
  fallbackPaths: {
    darwin: ["/usr/local/bin/hermes", "/opt/homebrew/bin/hermes"],
    windows: ["hermes.exe"],
  },
};

const claudeMeta: CLIMeta = {
  id: "claude",
  label: "Claude Code",
  description: "编程助手",
  commands: ["claude"],
  fallbackPaths: {
    darwin: ["/usr/local/bin/claude"],
    windows: ["claude.exe"],
  },
};

const claudeWithHomeMeta: CLIMeta = {
  id: "claude",
  label: "Claude Code",
  description: "编程助手",
  commands: ["claude"],
  fallbackPaths: {
    darwin: [
      "/usr/local/bin/claude",
      "$HOME/.claude/local/claude",
    ],
    windows: ["claude.exe"],
  },
};

describe("detectCLI", () => {
  it("finds CLI via execLookup (which)", async () => {
    const result = await detectCLI(
      hermesMeta,
      "darwin",
      async (cmd) => (cmd === "hermes" ? "/usr/local/bin/hermes" : null),
      async () => false,
    );

    expect(result).toEqual({
      id: "hermes",
      found: true,
      path: "/usr/local/bin/hermes",
    });
  });

  it("falls back to path list when execLookup fails", async () => {
    const result = await detectCLI(
      hermesMeta,
      "darwin",
      async () => null,
      async (p) => p === "/opt/homebrew/bin/hermes",
    );

    expect(result).toEqual({
      id: "hermes",
      found: true,
      path: "/opt/homebrew/bin/hermes",
    });
  });

  it("returns not found when all methods fail", async () => {
    const result = await detectCLI(
      hermesMeta,
      "darwin",
      async () => null,
      async () => false,
    );

    expect(result).toEqual({
      id: "hermes",
      found: false,
      path: null,
      error: "Hermes not found. Please install it first.",
    });
  });

  it("uses correct fallback paths for windows", async () => {
    const result = await detectCLI(
      hermesMeta,
      "windows",
      async () => null,
      async (p) => p === "hermes.exe",
    );

    expect(result.found).toBe(true);
    expect(result.path).toBe("hermes.exe");
  });

  it("expands $HOME in fallback paths", async () => {
    const result = await detectCLI(
      claudeWithHomeMeta,
      "darwin",
      async () => null,
      async (p) => p === "/Users/test/.claude/local/claude",
      "/Users/test",
    );

    expect(result.found).toBe(true);
    expect(result.path).toBe("/Users/test/.claude/local/claude");
  });

  it("skips $HOME paths when home is not provided", async () => {
    const result = await detectCLI(
      claudeWithHomeMeta,
      "darwin",
      async () => null,
      async () => false,
    );

    expect(result.found).toBe(false);
  });
});

describe("detectAllCLIs", () => {
  it("detects multiple CLIs", async () => {
    const results = await detectAllCLIs(
      [hermesMeta, claudeMeta],
      "darwin",
      async (cmd) =>
        cmd === "hermes"
          ? "/usr/local/bin/hermes"
          : cmd === "claude"
            ? "/usr/local/bin/claude"
            : null,
      async () => false,
    );

    expect(results).toHaveLength(2);
    expect(results[0].found).toBe(true);
    expect(results[1].found).toBe(true);
  });

  it("handles partial detection", async () => {
    const results = await detectAllCLIs(
      [hermesMeta, claudeMeta],
      "darwin",
      async (cmd) => (cmd === "hermes" ? "/usr/local/bin/hermes" : null),
      async () => false,
    );

    expect(results).toHaveLength(2);
    expect(results[0].found).toBe(true);
    expect(results[1].found).toBe(false);
  });
});
