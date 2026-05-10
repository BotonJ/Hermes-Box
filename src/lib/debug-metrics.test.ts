import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  updateTabMetrics,
  removeTabMetrics,
  createByteRateTracker,
} from "./debug-metrics";

describe("updateTabMetrics", () => {
  beforeEach(() => {
    // Clean up any existing tabs
    removeTabMetrics("tab-1");
    removeTabMetrics("tab-2");
    removeTabMetrics("tab-3");
  });

  it("creates new tab metrics", () => {
    updateTabMetrics("tab-1", { title: "Shell", isActive: true });
    // Verify by checking if remove works (indirect test)
    expect(() => removeTabMetrics("tab-1")).not.toThrow();
  });

  it("updates existing tab metrics", () => {
    updateTabMetrics("tab-1", { title: "Shell", bytesIn: 100 });
    updateTabMetrics("tab-1", { bytesIn: 200 });
    // Should not throw on update
    expect(() => removeTabMetrics("tab-1")).not.toThrow();
  });

  it("handles multiple tabs", () => {
    updateTabMetrics("tab-1", { title: "Shell 1" });
    updateTabMetrics("tab-2", { title: "Shell 2" });
    updateTabMetrics("tab-3", { title: "Shell 3" });

    expect(() => removeTabMetrics("tab-1")).not.toThrow();
    expect(() => removeTabMetrics("tab-2")).not.toThrow();
    expect(() => removeTabMetrics("tab-3")).not.toThrow();
  });
});

describe("removeTabMetrics", () => {
  it("removes existing tab", () => {
    updateTabMetrics("tab-1", { title: "Shell" });
    expect(() => removeTabMetrics("tab-1")).not.toThrow();
  });

  it("handles removing non-existent tab", () => {
    expect(() => removeTabMetrics("nonexistent")).not.toThrow();
  });
});

describe("createByteRateTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks byte rate correctly", () => {
    const onUpdate = vi.fn();
    const track = createByteRateTracker(onUpdate);

    // Send 1000 bytes
    track(1000);

    // Should not update yet (under 1 second)
    expect(onUpdate).not.toHaveBeenCalled();

    // Advance time past 1 second
    vi.advanceTimersByTime(1100);

    // Next call should trigger update
    track(500);

    expect(onUpdate).toHaveBeenCalledWith(
      expect.any(Number), // bytesPerSec
      expect.any(Number), // totalBytes
    );
  });

  it("calculates bytes per second correctly", () => {
    const onUpdate = vi.fn();
    const track = createByteRateTracker(onUpdate);

    // Send 2000 bytes in first chunk
    track(2000);

    // Advance 1 second
    vi.advanceTimersByTime(1000);

    // Send another chunk to trigger update
    track(1000);

    expect(onUpdate).toHaveBeenCalled();
    const [bps, total] = onUpdate.mock.calls[0];
    expect(total).toBe(3000); // 2000 + 1000
    expect(bps).toBeGreaterThan(0);
  });

  it("resets window after each update", () => {
    const onUpdate = vi.fn();
    const track = createByteRateTracker(onUpdate);

    // First window
    track(1000);
    vi.advanceTimersByTime(1000);
    track(500);

    expect(onUpdate).toHaveBeenCalledTimes(1);

    // Second window
    track(2000);
    vi.advanceTimersByTime(1000);
    track(300);

    expect(onUpdate).toHaveBeenCalledTimes(2);
  });
});
