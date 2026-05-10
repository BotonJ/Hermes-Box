import { describe, it, expect } from "vitest";
import {
  captureShellEnv,
  parseEnvOutput,
  mergeEnv,
  sanitizeEnv,
} from "./env-capture";

describe("parseEnvOutput", () => {
  it("parses standard env output", () => {
    const output = "HOME=/Users/dor\nPATH=/usr/bin:/bin\nSHELL=/bin/zsh\n";
    const env = parseEnvOutput(output);

    expect(env).toEqual({
      HOME: "/Users/dor",
      PATH: "/usr/bin:/bin",
      SHELL: "/bin/zsh",
    });
  });

  it("handles values with = signs", () => {
    const output = "OPTIND=1\nFOO=bar=baz\n";
    const env = parseEnvOutput(output);

    expect(env.FOO).toBe("bar=baz");
  });

  it("skips empty lines and lines without =", () => {
    const output = "\nHOME=/Users/dor\n\ninvalidline\nPATH=/usr/bin\n";
    const env = parseEnvOutput(output);

    expect(env).toEqual({
      HOME: "/Users/dor",
      PATH: "/usr/bin",
    });
  });

  it("returns empty object for empty string", () => {
    expect(parseEnvOutput("")).toEqual({});
  });
});

describe("mergeEnv", () => {
  it("overrides base with overrides", () => {
    const base = { PATH: "/usr/bin", HOME: "/Users/dor" };
    const overrides = { PATH: "/custom/bin", TERM: "xterm-256color" };

    const result = mergeEnv(base, overrides);

    expect(result).toEqual({
      PATH: "/custom/bin",
      HOME: "/Users/dor",
      TERM: "xterm-256color",
    });
  });

  it("does not mutate inputs", () => {
    const base = { A: "1" };
    const overrides = { B: "2" };
    const result = mergeEnv(base, overrides);

    expect(result).toEqual({ A: "1", B: "2" });
    expect(base).toEqual({ A: "1" });
    expect(overrides).toEqual({ B: "2" });
  });
});

describe("captureShellEnv", () => {
  it("captures env via runCommand and parses it", async () => {
    const mockRun = async () => "HOME=/test\nPATH=/usr/bin\n";

    const result = await captureShellEnv(mockRun);

    expect(result).toEqual({
      HOME: "/test",
      PATH: "/usr/bin",
    });
  });

  it("passes correct default shell and args to runCommand", async () => {
    let capturedCmd = "";
    let capturedArgs: string[] = [];

    const mockRun = async (cmd: string, args: string[]) => {
      capturedCmd = cmd;
      capturedArgs = args;
      return "";
    };

    await captureShellEnv(mockRun);

    expect(capturedCmd).toBe("/bin/zsh");
    expect(capturedArgs).toEqual(["-lc", "env"]);
  });

  it("accepts custom options", async () => {
    let capturedCmd = "";

    const mockRun = async (cmd: string) => {
      capturedCmd = cmd;
      return "HOME=/custom\n";
    };

    const result = await captureShellEnv(mockRun, {
      shell: "/bin/bash",
      args: ["-lc", "env"],
      timeoutMs: 3000,
    });

    expect(capturedCmd).toBe("/bin/bash");
    expect(result.HOME).toBe("/custom");
  });
});

describe("sanitizeEnv", () => {
  it("allows safe environment variables", () => {
    const env = { PATH: "/usr/bin", HOME: "/Users/test", LANG: "en_US.UTF-8" };
    expect(sanitizeEnv(env)).toEqual(env);
  });

  it("blocks dangerous variables", () => {
    const env = {
      PATH: "/usr/bin",
      LD_PRELOAD: "/malicious.so",
      DYLD_INSERT_LIBRARIES: "/malicious.dylib",
      NODE_OPTIONS: "--require=/malicious.js",
    };
    const result = sanitizeEnv(env);
    expect(result).toEqual({ PATH: "/usr/bin" });
    expect(result).not.toHaveProperty("LD_PRELOAD");
    expect(result).not.toHaveProperty("DYLD_INSERT_LIBRARIES");
    expect(result).not.toHaveProperty("NODE_OPTIONS");
  });

  it("allows prefixed variables like XDG_* and LC_*", () => {
    const env = { XDG_CONFIG_HOME: "/home/.config", LC_ALL: "en_US.UTF-8" };
    expect(sanitizeEnv(env)).toEqual(env);
  });

  it("returns empty object for empty input", () => {
    expect(sanitizeEnv({})).toEqual({});
  });

  it("does not mutate input", () => {
    const env = { PATH: "/usr/bin", LD_PRELOAD: "/bad.so" };
    const copy = { ...env };
    sanitizeEnv(env);
    expect(env).toEqual(copy);
  });
});
