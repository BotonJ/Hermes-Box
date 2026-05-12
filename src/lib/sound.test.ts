import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isSoundEnabled,
  setSoundEnabled,
  getClaudeSound,
  setClaudeSound,
  getHermesSound,
  setHermesSound,
  getHermesCustomPath,
  setHermesCustomPath,
  getClaudeCustomPath,
  setClaudeCustomPath,
  playSoundById,
  playApprovalSound,
  SYSTEM_SOUNDS,
} from "./sound";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

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

  describe("custom paths", () => {
    it("stores and retrieves claude custom path", () => {
      setClaudeCustomPath("/music/alert.mp3");
      expect(getClaudeCustomPath()).toBe("/music/alert.mp3");
    });

    it("stores and retrieves hermes custom path", () => {
      setHermesCustomPath("/music/chime.wav");
      expect(getHermesCustomPath()).toBe("/music/chime.wav");
    });

    it("returns empty string when no custom path set", () => {
      expect(getClaudeCustomPath()).toBe("");
      expect(getHermesCustomPath()).toBe("");
    });
  });

  describe("playSoundById", () => {
    it("calls Rust backend for system sounds", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValue(undefined);

      await playSoundById("Ping");

      expect(invoke).toHaveBeenCalledWith("play_sound", { soundName: "Ping" });
    });

    it("falls back to HTMLAudioElement when invoke fails", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockRejectedValue(new Error("not available"));

      // Should not throw
      await expect(playSoundById("Ping")).resolves.toBeUndefined();
    });
  });

  describe("playApprovalSound", () => {
    it("plays nothing when sound is disabled", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockClear();
      setSoundEnabled(false);
      playApprovalSound("claude");
      // Should not invoke — sound is disabled
      expect(invoke).not.toHaveBeenCalled();
    });
  });
});
