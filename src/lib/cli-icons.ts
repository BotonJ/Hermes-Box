export const CLI_ICONS: Record<string, string> = {
  hermes: "/icons/hermes-agent-light.png",
  claude: "/icons/claude-ai-iconpng.png",
  codex: "/icons/codex-color.png",
  opencode: "/icons/opencode-logo-light.png",
  openclaw: "/icons/openclaw-color.png",
  deepseek: "/icons/deepseek-color.png",
  shell: "/icons/macos-terminal-256.png",
};

/** Map command names to icon keys for custom CLI fallback. */
const COMMAND_ICON_MAP: Record<string, string> = {
  hermes: "hermes",
  claude: "claude",
  codex: "codex",
  opencode: "opencode",
  openclaw: "openclaw",
  deepseek: "deepseek",
};

function normalizeCLIName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getCLIIcon(id: string, command?: string, label?: string): string {
  if (CLI_ICONS[id]) return CLI_ICONS[id];
  if (command) {
    const cmd = command.split("/").pop()!;
    const key = COMMAND_ICON_MAP[cmd];
    if (key && CLI_ICONS[key]) return CLI_ICONS[key];
  }
  if (label) {
    const normalized = normalizeCLIName(label);
    for (const [iconKey, iconPath] of Object.entries(CLI_ICONS)) {
      if (normalized.includes(normalizeCLIName(iconKey))) return iconPath;
    }
  }
  return CLI_ICONS.shell;
}
