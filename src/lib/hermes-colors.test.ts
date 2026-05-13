import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn().mockResolvedValue("/home/user"),
}));

vi.stubGlobal("localStorage", {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
});

import { applyHermesColors, resetHermesColors, resolveHermesCliDir } from "./hermes-colors";

describe("hermes-colors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- resolveHermesCliDir ---

  it("resolves path from shebang in hermes wrapper", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    // shebang line pointing to venv
    vi.mocked(readTextFile).mockResolvedValueOnce(
      "#!/Users/dor/Downloads/Installers/hermes-agent-2026.4.23/venv/bin/python\n# wrapper\n",
    );

    const path = await resolveHermesCliDir();

    expect(path).toBe("/Users/dor/Downloads/Installers/hermes-agent-2026.4.23/hermes_cli");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "hermesbox:hermes-cli-path",
      "/Users/dor/Downloads/Installers/hermes-agent-2026.4.23/hermes_cli",
    );
  });

  it("returns cached path from localStorage without reading shebang", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/cached/hermes_cli");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const path = await resolveHermesCliDir();

    expect(path).toBe("/cached/hermes_cli");
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("returns empty string when shebang has no venv path", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile).mockResolvedValueOnce("#!/usr/bin/python3\n");

    const path = await resolveHermesCliDir();

    expect(path).toBe("");
  });

  it("returns empty string when reading wrapper fails", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile).mockRejectedValueOnce(new Error("not found"));

    const path = await resolveHermesCliDir();

    expect(path).toBe("");
  });

  // --- applyHermesColors ---

  it("applies light colors to skin_engine.py", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile).mockResolvedValueOnce(
      '"banner_text": "#FFF8DC"\n"prompt": "#FFF8DC"\n',
    );

    const result = await applyHermesColors("light");

    expect(result).toBe("Hermes colors → light mode");
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"banner_text": "#C5A882"'),
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"prompt": "#000000"'),
    );
  });

  it("applies dark colors to skin_engine.py", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile).mockResolvedValueOnce(
      '"banner_text": "#000000"\n"prompt": "#000000"\n',
    );

    const result = await applyHermesColors("dark");

    expect(result).toBe("Hermes colors → dark mode");
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"banner_text": "#C5A882"'),
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"prompt": "#FFF8DC"'),
    );
  });

  it("skips writing when no change needed", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    // Already has dark values
    vi.mocked(readTextFile).mockResolvedValueOnce(
      '"banner_text": "#C5A882"\n"prompt": "#FFF8DC"\n',
    );

    await applyHermesColors("dark");

    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("returns message even when no path configured", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await applyHermesColors("dark");

    expect(result).toBe("Hermes colors → dark mode");
  });

  it("handles readTextFile failure gracefully", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile).mockRejectedValue(new Error("file not found"));

    const result = await applyHermesColors("dark");
    expect(result).toBe("Hermes colors → dark mode");
  });

  // --- resetHermesColors ---

  it("resets skin_engine.py to original #FFF8DC", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile).mockResolvedValueOnce(
      '"banner_text": "#C5A882"\n"prompt": "#000000"\n',
    );

    const result = await resetHermesColors();

    expect(result).toBe("Hermes colors → reset");
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"banner_text": "#FFF8DC"'),
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"prompt": "#FFF8DC"'),
    );
  });

  it("resets skips when no path configured", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await resetHermesColors();

    expect(result).toBe("Hermes colors → reset");
  });
});
