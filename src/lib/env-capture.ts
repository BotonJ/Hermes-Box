export interface CaptureOptions {
  shell: string;
  args: string[];
  timeoutMs: number;
}

export async function captureShellEnv(
  runCommand: (cmd: string, args: string[], timeoutMs: number) => Promise<string>,
  options?: Partial<CaptureOptions>,
): Promise<Record<string, string>> {
  const shell = options?.shell ?? "/bin/zsh";
  const args = options?.args ?? ["-lc", "env"];
  const timeoutMs = options?.timeoutMs ?? 5000;

  const output = await runCommand(shell, args, timeoutMs);
  const rawEnv = parseEnvOutput(output);
  return sanitizeEnv(rawEnv);
}

export function parseEnvOutput(output: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const eqIndex = line.indexOf("=");
    if (eqIndex > 0) {
      const key = line.slice(0, eqIndex);
      const value = line.slice(eqIndex + 1);
      env[key] = value;
    }
  }
  return env;
}

export function mergeEnv(
  base: Record<string, string>,
  overrides: Record<string, string>,
): Record<string, string> {
  return { ...base, ...overrides };
}

const DANGEROUS_ENV_KEYS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "DYLD_FRAMEWORK_PATH",
  "PYTHONPATH",
  "PYTHONHOME",
  "NODE_OPTIONS",
  "NODE_PATH",
  "ELECTRON_RUN_AS_NODE",
]);

const ALLOWED_ENV_PREFIXES = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_",
  "TERM",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SHELL",
  "XDG_",
  "DISPLAY",
  "SSH_AUTH_SOCK",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "HOMEBREW_",
  "CONDA_",
  "NVM_",
  "RBENV_",
  "PYENV_",
  "JAVA_",
  "RUSTUP_",
  "CARGO_",
  "GOPATH",
  "GOROOT",
];

export function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (DANGEROUS_ENV_KEYS.has(key)) continue;
    if (ALLOWED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      result[key] = value;
    }
  }
  // Pass PS1 through with bash \[ \] stripped — xterm.js doesn't understand them.
  // This prevents conda's bash-style prompt from showing literal \[\] in zsh.
  if (env.PS1) {
    result.PS1 = env.PS1.replace(/\\\[|\\\]/g, "");
  }
  return result;
}
