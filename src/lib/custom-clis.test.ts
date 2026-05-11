import { describe, it, expect, beforeEach } from "vitest";
import {
  getCustomCLIs,
  addCustomCLI,
  removeCustomCLI,
  customCLIsToMeta,
} from "./custom-clis";

describe("custom-clis", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array by default", () => {
    expect(getCustomCLIs()).toEqual([]);
  });

  it("adds a custom CLI", () => {
    const entry = addCustomCLI("MyTool", "mytool");
    expect(entry.label).toBe("MyTool");
    expect(entry.command).toBe("mytool");
    expect(getCustomCLIs()).toHaveLength(1);
  });

  it("removes a custom CLI", () => {
    const entry = addCustomCLI("Tool", "tool");
    removeCustomCLI(entry.id);
    expect(getCustomCLIs()).toHaveLength(0);
  });

  it("only removes the targeted CLI", () => {
    addCustomCLI("A", "a");
    const b = addCustomCLI("B", "b");
    addCustomCLI("C", "c");
    removeCustomCLI(b.id);
    const remaining = getCustomCLIs();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((c) => c.label)).toEqual(["A", "C"]);
  });

  it("converts custom CLIs to CLIMeta", () => {
    addCustomCLI("MyTool", "mytool");
    const metas = customCLIsToMeta(getCustomCLIs());
    expect(metas).toHaveLength(1);
    expect(metas[0].label).toBe("MyTool");
    expect(metas[0].commands).toEqual(["mytool"]);
    expect(metas[0].id).toContain("custom-");
  });

  it("persists to localStorage", () => {
    addCustomCLI("Tool", "tool");
    const raw = localStorage.getItem("hermesbox:custom-clis");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toHaveLength(1);
  });

  it("handles corrupt localStorage gracefully", () => {
    localStorage.setItem("hermesbox:custom-clis", "not json");
    expect(getCustomCLIs()).toEqual([]);
  });
});
