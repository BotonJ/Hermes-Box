import { describe, it, expect } from "vitest";
import { validateCommandPath, escapeForPty } from "./validate-command";

describe("validateCommandPath", () => {
  it("accepts valid Unix absolute paths", () => {
    expect(validateCommandPath("/usr/local/bin/hermes")).toBe("/usr/local/bin/hermes");
    expect(validateCommandPath("/opt/homebrew/bin/claude")).toBe("/opt/homebrew/bin/claude");
  });

  it("accepts paths with spaces", () => {
    expect(validateCommandPath("/usr/local/my app/cli")).toBe("/usr/local/my app/cli");
  });

  it("rejects empty command", () => {
    expect(() => validateCommandPath("")).toThrow("empty");
    expect(() => validateCommandPath("  ")).toThrow("empty");
  });

  it("rejects newlines", () => {
    expect(() => validateCommandPath("/usr/bin/cli\nrm -rf /")).toThrow("newline");
    expect(() => validateCommandPath("/usr/bin/cli\rrm -rf /")).toThrow("newline");
  });

  it("rejects shell metacharacters", () => {
    expect(() => validateCommandPath("/usr/bin/cli;rm -rf /")).toThrow("metacharacters");
    expect(() => validateCommandPath("/usr/bin/$(whoami)")).toThrow("metacharacters");
    expect(() => validateCommandPath("/usr/bin/`whoami`")).toThrow("metacharacters");
    expect(() => validateCommandPath("/usr/bin/cli|cat")).toThrow("metacharacters");
  });

  it("rejects relative paths", () => {
    expect(() => validateCommandPath("hermes")).toThrow("not absolute");
  });

  it("rejects path traversal", () => {
    expect(() => validateCommandPath("/usr/bin/../etc/passwd")).toThrow("traversal");
  });

  it("accepts Windows absolute paths", () => {
    expect(validateCommandPath("C:\\Program Files\\hermes.exe")).toBe(
      "C:\\Program Files\\hermes.exe",
    );
  });
});

describe("escapeForPty", () => {
  it("wraps command in double quotes", () => {
    expect(escapeForPty("/usr/bin/hermes")).toBe('"/usr/bin/hermes"');
  });

  it("escapes embedded double quotes", () => {
    expect(escapeForPty('/usr/bin/it"s')).toBe('"/usr/bin/it\\"s"');
  });
});
