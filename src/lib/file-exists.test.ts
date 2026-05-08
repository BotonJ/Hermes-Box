import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(),
}));

import { exists } from "@tauri-apps/plugin-fs";
import { fileExists } from "./file-exists";

describe("fileExists", () => {
  it("returns true when file exists", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    expect(await fileExists("/usr/local/bin/hermes")).toBe(true);
  });

  it("returns false when file does not exist", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    expect(await fileExists("/nonexistent")).toBe(false);
  });

  it("returns false on exception", async () => {
    vi.mocked(exists).mockRejectedValue(new Error("Permission denied"));
    expect(await fileExists("/private/file")).toBe(false);
  });
});
