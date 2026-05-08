import { describe, it, expect, vi, afterEach } from "vitest";
import { scheduleCommand } from "./schedule-command";

describe("scheduleCommand", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays command write until after specified delay", () => {
    vi.useFakeTimers();
    const pty = { write: vi.fn() };
    const term = { write: vi.fn() };
    const validate = (s: string) => s;
    const escape = (s: string) => `"${s}"`;

    scheduleCommand(pty, term, "/usr/bin/nvim", validate, escape, 400);

    // Command should NOT be written immediately
    expect(pty.write).not.toHaveBeenCalled();

    // Advance past the delay
    vi.advanceTimersByTime(400);

    expect(pty.write).toHaveBeenCalledWith(`"/usr/bin/nvim"\n`);
  });

  it("uses default delay of 400ms when not specified", () => {
    vi.useFakeTimers();
    const pty = { write: vi.fn() };
    const term = { write: vi.fn() };
    const validate = (s: string) => s;
    const escape = (s: string) => s;

    scheduleCommand(pty, term, "/bin/foo", validate, escape);

    expect(pty.write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(pty.write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(pty.write).toHaveBeenCalledWith("/bin/foo\n");
  });

  it("returns cleanup function that cancels the timer", () => {
    vi.useFakeTimers();
    const pty = { write: vi.fn() };
    const term = { write: vi.fn() };
    const validate = (s: string) => s;
    const escape = (s: string) => s;

    const cancel = scheduleCommand(pty, term, "/bin/foo", validate, escape, 400);

    cancel();

    vi.advanceTimersByTime(400);
    expect(pty.write).not.toHaveBeenCalled();
  });

  it("writes error to terminal when validation fails", () => {
    vi.useFakeTimers();
    const pty = { write: vi.fn() };
    const term = { write: vi.fn() };
    const validate = () => {
      throw new Error("bad command");
    };
    const escape = (s: string) => s;

    scheduleCommand(pty, term, "/bad", validate, escape, 100);

    vi.advanceTimersByTime(100);

    expect(pty.write).not.toHaveBeenCalled();
    expect(term.write).toHaveBeenCalledWith(
      "\r\n[Error: Invalid command path]\r\n"
    );
  });
});
