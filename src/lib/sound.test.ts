import { describe, it, expect, beforeEach } from "vitest";
import {
  isSoundEnabled,
  setSoundEnabled,
} from "./sound";

describe("sound", () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it("persists across instances", () => {
    setSoundEnabled(true);
    expect(localStorage.getItem("hermesbox:approval-sound")).toBe("true");
  });
});
