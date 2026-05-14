export interface CLIMeta {
  id: string;
  label: string;
  description: string;
  commands: string[];
  /** Extra args appended when spawning in PTY (e.g. "tui" for openclaw). */
  execArgs?: string;
  fallbackPaths: Record<string, string[]>;
}

export interface DetectResult {
  id: string;
  found: boolean;
  path: string | null;
  error?: string;
}

export const CLI_REGISTRY: CLIMeta[] = [
  {
    id: "hermes",
    label: "Hermes",
    description: "AI 助手",
    commands: ["hermes"],
    fallbackPaths: {
      darwin: ["/usr/local/bin/hermes", "/opt/homebrew/bin/hermes", "$HOME/.local/bin/hermes"],
      windows: ["hermes.exe"],
    },
  },
  {
    id: "claude",
    label: "Claude Code",
    description: "编程助手",
    commands: ["claude"],
    fallbackPaths: {
      darwin: [
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
        "$HOME/.claude/local/claude",
      ],
      windows: ["claude.exe"],
    },
  },
  {
    id: "codex",
    label: "Codex",
    description: "OpenAI coding agent",
    commands: ["codex"],
    fallbackPaths: {
      darwin: ["/usr/local/bin/codex", "/opt/homebrew/bin/codex", "$HOME/.local/bin/codex"],
      windows: ["codex.exe"],
    },
  },
  {
    id: "opencode",
    label: "OpenCode",
    description: "Open-source coding agent",
    commands: ["opencode"],
    fallbackPaths: {
      darwin: ["/usr/local/bin/opencode", "/opt/homebrew/bin/opencode", "$HOME/.local/bin/opencode"],
      windows: ["opencode.exe"],
    },
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    description: "AI coding assistant",
    commands: ["openclaw"],
    execArgs: "tui",
    fallbackPaths: {
      darwin: ["/usr/local/bin/openclaw", "/opt/homebrew/bin/openclaw", "$HOME/.local/bin/openclaw"],
      windows: ["openclaw.exe"],
    },
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek AI TUI",
    commands: ["deepseek", "deepseek-tui"],
    fallbackPaths: {
      darwin: ["/usr/local/bin/deepseek", "/opt/homebrew/bin/deepseek", "$HOME/.local/bin/deepseek"],
      windows: ["deepseek.exe"],
    },
  },
];

export async function detectCLI(
  meta: CLIMeta,
  platform: string,
  execLookup: (cmd: string) => Promise<string | null>,
  fileExists: (path: string) => Promise<boolean>,
  home?: string,
): Promise<DetectResult> {
  for (const cmd of meta.commands) {
    const found = await execLookup(cmd);
    if (found) {
      return { id: meta.id, found: true, path: found };
    }
  }

  const fallbacks = (meta.fallbackPaths[platform] ?? [])
    .map((p) => p.replace("$HOME", home ?? ""))
    .filter((p) => !p.startsWith("/."));
  for (const p of fallbacks) {
    const exists = await fileExists(p);
    if (exists) {
      return { id: meta.id, found: true, path: p };
    }
  }

  return {
    id: meta.id,
    found: false,
    path: null,
    error: `${meta.label} not found. Please install it first.`,
  };
}

export async function detectAllCLIs(
  registry: CLIMeta[],
  platform: string,
  execLookup: (cmd: string) => Promise<string | null>,
  fileExists: (path: string) => Promise<boolean>,
  home?: string,
): Promise<DetectResult[]> {
  return Promise.all(
    registry.map((meta) => detectCLI(meta, platform, execLookup, fileExists, home)),
  );
}
