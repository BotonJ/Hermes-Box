import { describe, it, expect, vi } from "vitest";
import { scheduleCommand } from "./schedule-command";

describe("scheduleCommand", () => {
  it("returns a cleanup function without writing to PTY (command is now handled by Rust exec)", () => {
    const pty = { write: vi.fn() };
    const term = { write: vi.fn() };
    const validate = (s: string) => s;
    const escape = (s: string) => s;

    const cancel = scheduleCommand(pty, term, "/usr/bin/nvim", validate, escape, 400);

    expect(pty.write).not.toHaveBeenCalled();
    expect(typeof cancel).toBe("function");
    cancel();
  });
});
