import { describe, it, expect, beforeEach } from "vitest";
import {
  isSoundEnabled,
  setSoundEnabled,
  getClaudeSound,
  setClaudeSound,
  getHermesSound,
  setHermesSound,
  SYSTEM_SOUNDS,
} from "./sound";

describe("sound", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("toggle", () => {
    it("returns false by default", () => {
      expect(isSoundEnabled()).toBe(false);
    });

    it("returns true after enabling", () => {
      setSoundEnabled(true);
      expect(isSoundEnabled()).toBe(true);
    });

    it("returns false after disabling", () => {
      setSoundEnabled(true);
      setSoundEnabled(false);
      expect(isSoundEnabled()).toBe(false);
    });

    it("persists to localStorage", () => {
      setSoundEnabled(true);
      expect(localStorage.getItem("hermesbox:approval-sound")).toBe("true");
    });
  });

  describe("claude sound", () => {
    it("defaults to Ping", () => {
      expect(getClaudeSound()).toBe("Ping");
    });

    it("stores and retrieves custom sound", () => {
      setClaudeSound("Hero");
      expect(getClaudeSound()).toBe("Hero");
    });

    it("falls back to default for invalid stored value", () => {
      localStorage.setItem("hermesbox:sound-claude", "NonExistent");
      expect(getClaudeSound()).toBe("Ping");
    });
  });

  describe("hermes sound", () => {
    it("defaults to Glass", () => {
      expect(getHermesSound()).toBe("Glass");
    });

    it("stores and retrieves custom sound", () => {
      setHermesSound("Submarine");
      expect(getHermesSound()).toBe("Submarine");
    });

    it("falls back to default for invalid stored value", () => {
      localStorage.setItem("hermesbox:sound-hermes", "NonExistent");
      expect(getHermesSound()).toBe("Glass");
    });
  });

  describe("SYSTEM_SOUNDS", () => {
    it("contains expected system sounds", () => {
      expect(SYSTEM_SOUNDS).toContain("Ping");
      expect(SYSTEM_SOUNDS).toContain("Glass");
      expect(SYSTEM_SOUNDS).toContain("Hero");
    });

    it("is non-empty", () => {
      expect(SYSTEM_SOUNDS.length).toBeGreaterThan(0);
    });
  });
});
