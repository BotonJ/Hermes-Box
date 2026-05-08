import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: () => "macos",
}));

import { Command } from "@tauri-apps/plugin-shell";
import { execLookup } from "./exec-lookup";

describe("execLookup", () => {
  beforeEach(() => {
    vi.mocked(Command.create).mockClear();
  });

  it("returns path when which finds a binary", async () => {
    vi.mocked(Command.create).mockReturnValue({
      execute: () => Promise.resolve({ code: 0, stdout: "/usr/local/bin/hermes\n", stderr: "" }),
    } as never);

    const result = await execLookup("hermes");
    expect(result).toBe("/usr/local/bin/hermes");
    expect(Command.create).toHaveBeenCalledTimes(1);
  });

  it("falls back to login shell when which fails", async () => {
    vi.mocked(Command.create)
      .mockReturnValueOnce({
        execute: () => Promise.resolve({ code: 1, stdout: "", stderr: "not found" }),
      } as never)
      .mockReturnValueOnce({
        execute: () => Promise.resolve({ code: 0, stdout: "/Users/dor/.local/bin/hermes\n", stderr: "" }),
      } as never);

    const result = await execLookup("hermes");
    expect(result).toBe("/Users/dor/.local/bin/hermes");
    expect(Command.create).toHaveBeenCalledTimes(2);
  });

  it("returns null when both which and login shell fail", async () => {
    vi.mocked(Command.create).mockReturnValue({
      execute: () => Promise.resolve({ code: 1, stdout: "", stderr: "not found" }),
    } as never);

    const result = await execLookup("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when Command.create throws", async () => {
    vi.mocked(Command.create).mockImplementation(() => {
      throw new Error("Shell not available");
    });

    const result = await execLookup("hermes");
    expect(result).toBeNull();
  });
});
