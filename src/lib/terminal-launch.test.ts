import { describe, it, expect, vi } from "vitest";
import { launchInTerminal } from "./terminal-launch";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("launchInTerminal", () => {
  it("calls invoke with correct command name and cli argument", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue(undefined);

    await launchInTerminal("hermes");

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("launch_in_terminal", {
      cli: "hermes",
    });
  });

  it("throws on empty command", async () => {
    await expect(launchInTerminal("")).rejects.toThrow("cannot be empty");
    await expect(launchInTerminal("  ")).rejects.toThrow("cannot be empty");
  });

  it("passes through errors from invoke", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockRejectedValue(new Error("spawn failed"));

    await expect(launchInTerminal("claude")).rejects.toThrow("spawn failed");
  });
});
