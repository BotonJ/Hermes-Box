import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.stubGlobal("localStorage", {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
});

import { applyHermesColors, resetHermesColors, getHermesCliPathStatus } from "./hermes-colors";

describe("hermes-colors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips patching when no Hermes CLI path is configured", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const result = await applyHermesColors("dark");

    expect(result).toBe("Hermes colors → dark mode");
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("patches banner and skin_engine for dark theme", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    // Banner contains a different color so the replacement causes a change
    vi.mocked(readTextFile)
      .mockResolvedValueOnce('banner_color = "#6B5B4A"\n')
      .mockResolvedValueOnce('"banner_text": "#000000"\n"prompt": "#ffffff"\n');

    const result = await applyHermesColors("dark");

    expect(result).toBe("Hermes colors → dark mode");
    expect(readTextFile).toHaveBeenCalledWith("/fake/hermes_cli/banner.py");
    expect(readTextFile).toHaveBeenCalledWith("/fake/hermes_cli/skin_engine.py");
    expect(writeTextFile).toHaveBeenCalledTimes(2);
  });

  it("patches with light colors for light theme", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile)
      .mockResolvedValueOnce('# banner color: #6B5B4A\n')
      .mockResolvedValueOnce('"banner_text": "#C5A882"\n"prompt": "#FFF8DC"\n');

    const result = await applyHermesColors("light");

    expect(result).toBe("Hermes colors → light mode");
  });

  it("does not write when regex does not match (no change)", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile)
      .mockResolvedValueOnce("no matching colors here\n")
      .mockResolvedValueOnce("no matching keys here\n");

    await applyHermesColors("dark");

    // writeTextFile not called because content unchanged
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("handles readTextFile failure gracefully", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile).mockRejectedValue(new Error("file not found"));

    const result = await applyHermesColors("dark");
    expect(result).toBe("Hermes colors → dark mode");
  });

  it("handles localStorage failure gracefully", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("denied");
    });
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const result = await applyHermesColors("dark");

    expect(result).toBe("Hermes colors → dark mode");
    expect(readTextFile).not.toHaveBeenCalled();
  });

  // --- resetHermesColors ---

  it("resetHermesColors patches skin_engine with original #FFF8DC values", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile)
      .mockResolvedValueOnce('banner_color = "#C5A882"\n')
      .mockResolvedValueOnce('"banner_text": "#000000"\n"prompt": "#C5A882"\n');

    const result = await resetHermesColors();

    expect(result).toBe("Hermes colors → reset");
    // banner.py patched back to #FFF8DC
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/banner.py",
      expect.stringContaining("#FFF8DC"),
    );
    // skin_engine.py patched back to #FFF8DC for both keys
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"banner_text": "#FFF8DC"'),
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"prompt": "#FFF8DC"'),
    );
  });

  it("resetHermesColors skips when no Hermes CLI path", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const result = await resetHermesColors();

    expect(result).toBe("Hermes colors → reset");
    expect(readTextFile).not.toHaveBeenCalled();
  });

  // --- getHermesCliPathStatus ---

  it("getHermesCliPathStatus returns 'found' when path is set", () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");

    expect(getHermesCliPathStatus()).toBe("found");
  });

  it("getHermesCliPathStatus returns 'not-found' when path is empty", () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

    expect(getHermesCliPathStatus()).toBe("not-found");
  });

  it("getHermesCliPathStatus returns 'not-found' on localStorage error", () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("denied");
    });

    expect(getHermesCliPathStatus()).toBe("not-found");
  });
});
