import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("localStorage", {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
});

import {
  getTheme,
  setTheme,
  getEffectiveTheme,
  initTheme,
} from "./theme";

function getDocumentTheme(): string {
  return document.documentElement.dataset.theme ?? "dark";
}

// Helper: override matchMedia for a single test
function mockMatchMedia(dark: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: dark && query === "(prefers-color-scheme: dark)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

describe("theme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.removeAttribute("data-theme");
    // Default: system prefers dark
    mockMatchMedia(true);
  });

  describe("getTheme", () => {
    it('returns "dark" by default when localStorage is empty', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
      expect(getTheme()).toBe("dark");
    });

    it("returns each preset", () => {
      for (const preset of ["dark", "grass", "ocean", "sunset", "lavender", "system"]) {
        (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(preset);
        expect(getTheme()).toBe(preset);
      }
    });

    it('migrates old "light" to "grass"', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("light");
      expect(getTheme()).toBe("grass");
      expect(localStorage.setItem).toHaveBeenCalledWith("hermesbox:theme", "grass");
    });

    it("returns dark when localStorage throws", () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("denied");
      });
      expect(getTheme()).toBe("dark");
    });

    it("returns dark for unknown values", () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("invalid");
      expect(getTheme()).toBe("dark");
    });
  });

  describe("setTheme", () => {
    it("writes choice to localStorage and sets data-theme", () => {
      setTheme("ocean");
      expect(localStorage.setItem).toHaveBeenCalledWith("hermesbox:theme", "ocean");
      expect(getDocumentTheme()).toBe("ocean");
    });

    it("resolves system to dark when OS prefers dark", () => {
      mockMatchMedia(true);
      setTheme("system");
      expect(getDocumentTheme()).toBe("gruvbox-dark");
    });

    it("resolves system to atom-one-light when OS prefers light", () => {
      mockMatchMedia(false);
      setTheme("system");
      expect(getDocumentTheme()).toBe("atom-one-light");
    });

    it("handles localStorage failure gracefully", () => {
      (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("denied");
      });
      expect(() => setTheme("dark")).not.toThrow();
      expect(getDocumentTheme()).toBe("dark");
    });
  });

  describe("getEffectiveTheme", () => {
    it("returns 'dark' for dark presets", () => {
      for (const preset of ["dark", "ocean", "sunset", "lavender", "gruvbox-dark"]) {
        (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(preset);
        expect(getEffectiveTheme()).toBe("dark");
      }
    });

    it("returns 'light' for light presets", () => {
      for (const preset of ["grass", "atom-one-light"]) {
        (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(preset);
        expect(getEffectiveTheme()).toBe("light");
      }
    });

    it("returns 'dark' when system + OS prefers dark", () => {
      mockMatchMedia(true);
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("system");
      expect(getEffectiveTheme()).toBe("dark");
    });

    it("returns 'light' when system + OS prefers light", () => {
      mockMatchMedia(false);
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("system");
      expect(getEffectiveTheme()).toBe("light");
    });
  });

  describe("system listener", () => {
    it("always applies hermes colors on first change even if matchMedia was stale", () => {
      // Simulate: matchMedia initially reports dark (stale), system is actually light
      const listeners: Array<() => void> = [];
      vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
        matches: true, // stale: reports dark
        media: query,
        addEventListener: vi.fn((_event: string, cb: () => void) => { listeners.push(cb); }),
        removeEventListener: vi.fn(),
      })));

      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("system");
      setTheme("system");
      expect(getDocumentTheme()).toBe("gruvbox-dark");

      // Now matchMedia flips to light (true state)
      vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
        matches: false, // correct: light
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })));

      // First change fires — even though lastSystemEffective was "dark" and
      // new effective is now "light" (different), it should apply.
      // This also tests the first-fire-always-applies behavior.
      expect(listeners.length).toBe(1);
      listeners[0]();

      expect(getDocumentTheme()).toBe("atom-one-light");
    });

    it("skips hermes colors when effective theme unchanged after first fire", () => {
      const listeners: Array<() => void> = [];
      vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn((_event: string, cb: () => void) => { listeners.push(cb); }),
        removeEventListener: vi.fn(),
      })));

      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("system");
      setTheme("system");
      expect(listeners.length).toBe(1);

      // First fire — matchMedia still dark, effective = "dark"
      listeners[0]();
      expect(getDocumentTheme()).toBe("gruvbox-dark");

      // Second fire — still dark, should not re-apply (no-op)
      listeners[0]();
      expect(getDocumentTheme()).toBe("gruvbox-dark");
    });
  });

  describe("initTheme", () => {
    it("applies stored preset on boot", () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("ocean");
      initTheme();
      expect(getDocumentTheme()).toBe("ocean");
    });

    it("resolves system to dark when OS prefers dark", () => {
      mockMatchMedia(true);
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("system");
      initTheme();
      expect(getDocumentTheme()).toBe("gruvbox-dark");
    });

    it("resolves system to atom-one-light when OS prefers light", () => {
      mockMatchMedia(false);
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("system");
      initTheme();
      expect(getDocumentTheme()).toBe("atom-one-light");
    });
  });
});
