import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn().mockResolvedValue("/home/user"),
}));

vi.mock("./exec-lookup", () => ({
  execLookup: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn().mockReturnValue("macos"),
}));

const mockShellExecute = vi.fn();
vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: () => ({ execute: mockShellExecute }),
  },
}));

vi.stubGlobal("localStorage", {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
});

import { applyHermesColors, resetHermesColors, resolveHermesCliDir } from "./hermes-colors";
import { execLookup } from "./exec-lookup";

describe("hermes-colors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- resolveHermesCliDir ---

  it("resolves path from shebang in hermes wrapper", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(execLookup).mockResolvedValueOnce("/home/testuser/.local/bin/hermes");
    vi.mocked(readTextFile).mockResolvedValueOnce(
      "#!/home/testuser/hermes-agent-2026.4.23/venv/bin/python\n# wrapper\n",
    );

    const path = await resolveHermesCliDir();

    expect(path).toBe("/home/testuser/hermes-agent-2026.4.23/hermes_cli");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "hermesbox:hermes-cli-path",
      "/home/testuser/hermes-agent-2026.4.23/hermes_cli",
    );
  });

  it("returns cached path from localStorage, validating file exists", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/cached/hermes_cli");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const path = await resolveHermesCliDir();

    expect(path).toBe("/cached/hermes_cli");
    expect(readTextFile).toHaveBeenCalledWith("/cached/hermes_cli/skin_engine.py");
  });

  it("returns empty string when which hermes fails", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    vi.mocked(execLookup).mockResolvedValueOnce(null);

    const path = await resolveHermesCliDir();

    expect(path).toBe("");
  });

  it("returns empty string when shebang has no venv path", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(execLookup).mockResolvedValueOnce("/home/testuser/.local/bin/hermes");
    vi.mocked(readTextFile).mockResolvedValueOnce("#!/usr/bin/python3\n");

    const path = await resolveHermesCliDir();

    expect(path).toBe("");
  });

  it("returns empty string when both readTextFile and shell fallback fail", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(execLookup).mockResolvedValueOnce("/home/testuser/.local/bin/hermes");
    vi.mocked(readTextFile).mockRejectedValueOnce(new Error("not found"));
    mockShellExecute.mockRejectedValueOnce(new Error("shell failed"));

    const path = await resolveHermesCliDir();

    expect(path).toBe("");
  });

  it("falls back to shell when readTextFile fails (symlink)", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(execLookup).mockResolvedValueOnce("/home/testuser/.local/bin/hermes");
    vi.mocked(readTextFile).mockRejectedValueOnce(new Error("forbidden path"));
    mockShellExecute.mockResolvedValueOnce({
      code: 0,
      stdout:
        "#!/home/testuser/hermes-agent-2026.4.23/venv/bin/python\n",
      stderr: "",
    });

    const path = await resolveHermesCliDir();

    expect(path).toBe(
      "/home/testuser/hermes-agent-2026.4.23/hermes_cli",
    );
  });

  // --- applyHermesColors ---

  it("applies light colors", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile)
      .mockResolvedValueOnce("")       // validation of cached path
      .mockResolvedValueOnce(          // banner.py (patchBanner)
        'text = "#FFFFFF"\n',
      )
      .mockResolvedValueOnce(          // skin_engine.py (patchSkinEngine)
        '"banner_text": "#FFF8DC"\n"prompt": "#FFF8DC"\n',
      );

    const result = await applyHermesColors("light");

    expect(result).toBe("Hermes colors → light mode");
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/banner.py",
      'text = "#C5A882"\n',
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"banner_text": "#C5A882"'),
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"prompt": "#000000"'),
    );
  });

  it("applies dark colors", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(          // banner.py
        'text = "#FFFFFF"\n',
      )
      .mockResolvedValueOnce(          // skin_engine.py
        '"banner_text": "#000000"\n"prompt": "#000000"\n',
      );

    const result = await applyHermesColors("dark");

    expect(result).toBe("Hermes colors → dark mode");
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/banner.py",
      'text = "#C5A882"\n',
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"banner_text": "#C5A882"'),
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/skin_engine.py",
      expect.stringContaining('"prompt": "#FFF8DC"'),
    );
  });

  it("skips writing when values already match", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(          // banner.py already correct
        'text = "#C5A882"\n',
      )
      .mockResolvedValueOnce(          // skin_engine.py already correct
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

  it("resets to original #FFF8DC", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("/fake/hermes_cli");
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");

    vi.mocked(readTextFile)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(          // banner.py
        'text = "#C5A882"\n',
      )
      .mockResolvedValueOnce(          // skin_engine.py
        '"banner_text": "#C5A882"\n"prompt": "#000000"\n',
      );

    const result = await resetHermesColors();

    expect(result).toBe("Hermes colors → reset");
    expect(writeTextFile).toHaveBeenCalledWith(
      "/fake/hermes_cli/banner.py",
      'text = "#FFF8DC"\n',
    );
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
