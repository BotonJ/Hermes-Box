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

  describe("LIGHT (macOS Grass)", () => {
    const light = getXtermTheme("light");

    it("background is green", () => {
      expect(light.background).toBe("#487147");
    });

    it("foreground is near-white", () => {
      expect(light.foreground).toBe("#f4f4f4");
    });

    it("brightBlack (8) is dark gray", () => {
      expect(light.brightBlack).toBe("#555753");
    });

    it("brightWhite (15) is near-white", () => {
      expect(light.brightWhite).toBe("#eeeeec");
    });

    it("cursor matches foreground", () => {
      expect(light.cursor).toBe("#f4f4f4");
    });
  });

  describe("dark vs light", () => {
    it("should have different backgrounds", () => {
      expect(getXtermTheme("dark").background).not.toBe(getXtermTheme("light").background);
    });
  });
});
