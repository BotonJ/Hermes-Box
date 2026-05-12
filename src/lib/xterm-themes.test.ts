import { describe, it, expect } from "vitest";
import { getXtermTheme } from "./xterm-themes";

describe("xterm-themes", () => {
  describe("DARK (Gruvbox Dark)", () => {
    const dark = getXtermTheme("dark");

    it("background is Gruvbox dark", () => {
      expect(dark.background).toBe("#282828");
    });

    it("foreground is Gruvbox light", () => {
      expect(dark.foreground).toBe("#ebdbb2");
    });

    it("cursor matches foreground", () => {
      expect(dark.cursor).toBe("#ebdbb2");
    });

    it("brightBlack (8) is Gruvbox gray", () => {
      expect(dark.brightBlack).toBe("#928374");
    });

    it("brightWhite (15) matches foreground", () => {
      expect(dark.brightWhite).toBe("#ebdbb2");
    });

    it("selection background matches Gruvbox", () => {
      expect(dark.selectionBackground).toBe("#665c54");
    });
  });

  describe("GRASS (macOS Grass)", () => {
    const grass = getXtermTheme("grass");

    it("background is green", () => {
      expect(grass.background).toBe("#487147");
    });

    it("foreground is near-white", () => {
      expect(grass.foreground).toBe("#f4f4f4");
    });

    it("brightBlack (8) is dark gray", () => {
      expect(grass.brightBlack).toBe("#555753");
    });

    it("brightWhite (15) is near-white", () => {
      expect(grass.brightWhite).toBe("#eeeeec");
    });

    it("cursor matches foreground", () => {
      expect(grass.cursor).toBe("#f4f4f4");
    });
  });

  describe("dark vs grass", () => {
    it("should have different backgrounds", () => {
      expect(getXtermTheme("dark").background).not.toBe(getXtermTheme("grass").background);
    });
  });

  describe("system", () => {
    it("falls back to dark theme", () => {
      const sys = getXtermTheme("system");
      const dark = getXtermTheme("dark");
      expect(sys.background).toBe(dark.background);
    });
  });

  describe("new presets", () => {
    it("ocean has distinct background", () => {
      expect(getXtermTheme("ocean").background).not.toBe(getXtermTheme("dark").background);
    });

    it("sunset has distinct background", () => {
      expect(getXtermTheme("sunset").background).not.toBe(getXtermTheme("dark").background);
    });

    it("lavender has distinct background", () => {
      expect(getXtermTheme("lavender").background).not.toBe(getXtermTheme("dark").background);
    });
  });
});
