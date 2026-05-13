import { describe, it, expect, vi, beforeEach } from "vitest";
import { getExternalTerminal, setExternalTerminal } from "./external-terminal";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("external-terminal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty string when nothing stored", () => {
    expect(getExternalTerminal()).toBe("");
  });

  it("returns stored bundle name", () => {
    setExternalTerminal("iTerm.app");
    expect(getExternalTerminal()).toBe("iTerm.app");
  });

  it("returns empty string after clear", () => {
    setExternalTerminal("Ghostty.app");
    localStorage.clear();
    expect(getExternalTerminal()).toBe("");
  });

  it("detectInstalledTerminals calls invoke", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue([
      { name: "Terminal", bundle: "Terminal.app" },
    ]);

    const { detectInstalledTerminals } = await import("./external-terminal");
    const result = await detectInstalledTerminals();

    expect(invoke).toHaveBeenCalledWith("detect_terminals");
    expect(result).toEqual([{ name: "Terminal", bundle: "Terminal.app" }]);
  });
});
