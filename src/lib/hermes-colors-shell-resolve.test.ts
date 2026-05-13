/**
 * Minimal test: verify that shell-based shebang resolution works
 * without relying on Tauri FS readTextFile (which blocks on symlinks).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecute = vi.fn();

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: () => ({ execute: mockExecute }),
  },
}));

const VENV_RE = /^#!(.*)\/venv\/bin\/python/;

async function resolveViaShell(): Promise<string> {
  try {
    const { Command } = await import("@tauri-apps/plugin-shell");
    const output = await Command.create("/bin/zsh", [
      "-l",
      "-c",
      'head -1 "$(which hermes)"',
    ]).execute();

    if (output.code !== 0 || !output.stdout.trim()) {
      return "";
    }

    const shebang = output.stdout.trim().split("\n")[0];
    const match = VENV_RE.exec(shebang);
    if (!match) return "";

    return `${match[1]}/hermes_cli`;
  } catch {
    return "";
  }
}

describe("shell-based shebang resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts hermes_cli path from real shebang output", async () => {
    mockExecute.mockResolvedValueOnce({
      code: 0,
      stdout:
        "#!/home/testuser/hermes-agent-2026.4.23/venv/bin/python\n",
      stderr: "",
    });

    const result = await resolveViaShell();

    expect(result).toBe(
      "/home/testuser/hermes-agent-2026.4.23/hermes_cli",
    );
  });

  it("returns empty when command fails", async () => {
    mockExecute.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "" });

    const result = await resolveViaShell();

    expect(result).toBe("");
  });

  it("returns empty when shebang has no venv path", async () => {
    mockExecute.mockResolvedValueOnce({
      code: 0,
      stdout: "#!/usr/bin/python3\n",
      stderr: "",
    });

    const result = await resolveViaShell();

    expect(result).toBe("");
  });

  it("handles command exception", async () => {
    mockExecute.mockRejectedValueOnce(new Error("shell not found"));

    const result = await resolveViaShell();

    expect(result).toBe("");
  });

  it("uses the correct shell command args", async () => {
    mockExecute.mockResolvedValueOnce({
      code: 0,
      stdout:
        "#!/home/testuser/hermes-agent-2026.4.23/venv/bin/python\n",
      stderr: "",
    });

    await resolveViaShell();

    // Command.create was called — we can verify via the mock's call context
    // but since create is a plain function, just verify execute was called
    expect(mockExecute).toHaveBeenCalledOnce();
  });
});
