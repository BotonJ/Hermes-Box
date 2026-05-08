import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listeners: Array<(e: MediaQueryListEvent) => void> = [];
vi.stubGlobal("localStorage", {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
});
vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
  matches: query === "(prefers-color-scheme: dark)",
  media: query,
  addEventListener: vi.fn((_type: string, cb: (e: MediaQueryListEvent) => void) => {
    listeners.push(cb);
  }),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  onchange: null,
})));

import {
  getThemeMode,
  setThemeMode,
  getEffectiveTheme,
  initTheme,
} from "./theme";

function getDocumentTheme(): string {
  return document.documentElement.dataset.theme ?? "dark";
}

describe("theme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.removeAttribute("data-theme");
    listeners.length = 0;
  });

  afterEach(() => {
    listeners.length = 0;
  });

  describe("getThemeMode", () => {
    it('returns "dark" by default when localStorage is empty', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
      expect(getThemeMode()).toBe("dark");
    });

    it('returns stored "light"', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("light");
      expect(getThemeMode()).toBe("light");
    });

    it('returns stored "dark"', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("dark");
      expect(getThemeMode()).toBe("dark");
    });

    it('returns stored "system"', () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("system");
      expect(getThemeMode()).toBe("system");
    });

    it("returns dark when localStorage throws", () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("denied");
      });
      expect(getThemeMode()).toBe("dark");
    });

    it("returns dark for unknown values", () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("invalid");
      expect(getThemeMode()).toBe("dark");
    });
  });

  describe("setThemeMode", () => {
    it("writes 'dark' to localStorage and sets data-theme", () => {
      setThemeMode("dark");
      expect(localStorage.setItem).toHaveBeenCalledWith("hermesbox:theme", "dark");
      expect(getDocumentTheme()).toBe("dark");
    });

    it("writes 'light' to localStorage and sets data-theme", () => {
      setThemeMode("light");
      expect(localStorage.setItem).toHaveBeenCalledWith("hermesbox:theme", "light");
      expect(getDocumentTheme()).toBe("light");
    });

    it("writes 'system' to localStorage and sets data-theme to dark (mock matches dark)", () => {
      setThemeMode("system");
      expect(localStorage.setItem).toHaveBeenCalledWith("hermesbox:theme", "system");
      expect(getDocumentTheme()).toBe("dark");
    });

    it("handles localStorage failure gracefully", () => {
      (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("denied");
      });
      expect(() => setThemeMode("dark")).not.toThrow();
      expect(getDocumentTheme()).toBe("dark");
    });
  });

  describe("getEffectiveTheme", () => {
    it("returns 'dark' when stored setting is 'dark'", () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("dark");
      expect(getEffectiveTheme()).toBe("dark");
    });

    it("returns 'light' when stored setting is 'light'", () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("light");
      expect(getEffectiveTheme()).toBe("light");
    });

    it("returns 'dark' when stored setting is 'system' and mock matches dark", () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("system");
      expect(getEffectiveTheme()).toBe("dark");
    });
  });

  describe("initTheme", () => {
    it("applies stored dark theme on boot", () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("light");
      initTheme();
      expect(getDocumentTheme()).toBe("light");
    });

    it("applies stored system theme and resolves to actual theme", () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("system");
      initTheme();
      expect(getDocumentTheme()).toBe("dark");
    });
  });
});
