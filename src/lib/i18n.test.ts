import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getLocale, setLocale, t } from "./i18n";

describe("i18n", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-locale");
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("getLocale", () => {
    it("returns en by default when no locale stored", () => {
      expect(getLocale()).toBe("en");
    });

    it("returns stored zh locale", () => {
      localStorage.setItem("hermesbox:locale", "zh");
      expect(getLocale()).toBe("zh");
    });

    it("returns stored en locale", () => {
      localStorage.setItem("hermesbox:locale", "en");
      expect(getLocale()).toBe("en");
    });

    it("returns en for invalid stored values", () => {
      localStorage.setItem("hermesbox:locale", "fr");
      expect(getLocale()).toBe("en");
    });
  });

  describe("setLocale", () => {
    it("stores zh locale", () => {
      setLocale("zh");
      expect(localStorage.getItem("hermesbox:locale")).toBe("zh");
    });

    it("stores en locale", () => {
      setLocale("en");
      expect(localStorage.getItem("hermesbox:locale")).toBe("en");
    });

    it("sets data-locale attribute on document element", () => {
      setLocale("zh");
      expect(document.documentElement.dataset.locale).toBe("zh");
    });

    it("updates data-locale when switching languages", () => {
      setLocale("en");
      expect(document.documentElement.dataset.locale).toBe("en");
      setLocale("zh");
      expect(document.documentElement.dataset.locale).toBe("zh");
    });
  });

  describe("t", () => {
    it("translates app.welcome in English", () => {
      localStorage.setItem("hermesbox:locale", "en");
      expect(t("app.welcome")).toBe("Welcome to HermesBox");
    });

    it("translates app.welcome in Chinese", () => {
      localStorage.setItem("hermesbox:locale", "zh");
      expect(t("app.welcome")).toBe("欢迎使用 HermesBox");
    });

    it("translates cli.shell in English", () => {
      localStorage.setItem("hermesbox:locale", "en");
      expect(t("cli.shell")).toBe("Shell");
    });

    it("translates cli.shell in Chinese", () => {
      localStorage.setItem("hermesbox:locale", "zh");
      expect(t("cli.shell")).toBe("终端");
    });

    it("returns key for unknown key", () => {
      localStorage.setItem("hermesbox:locale", "en");
      expect(t("unknown.key")).toBe("unknown.key");
    });

    it("returns key when invalid locale is stored", () => {
      localStorage.setItem("hermesbox:locale", "invalid");
      // Falls back to "en"
      expect(t("app.welcome")).toBe("Welcome to HermesBox");
    });

    it("returns key for prototype property (toString)", () => {
      localStorage.setItem("hermesbox:locale", "en");
      expect(t("toString")).toBe("toString");
    });

    it("returns key for __proto__ traversal", () => {
      localStorage.setItem("hermesbox:locale", "en");
      expect(t("__proto__.__proto__")).toBe("__proto__.__proto__");
    });
  });
});
