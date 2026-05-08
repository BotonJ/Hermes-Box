import { Command } from "@tauri-apps/plugin-shell";
import { platform } from "@tauri-apps/plugin-os";

async function tryWhich(
  tool: string,
  args: string[],
): Promise<string | null> {
  try {
    const output = await Command.create(tool, args).execute();
    if (output.code === 0 && output.stdout.trim()) {
      return output.stdout.trim().split("\n")[0];
    }
    return null;
  } catch {
    return null;
  }
}

export async function execLookup(cmd: string): Promise<string | null> {
  if (platform() === "windows") {
    return tryWhich("where", [cmd]);
  }

  // Try standard `which` first (works when PATH includes the command).
  const standard = await tryWhich("which", [cmd]);
  if (standard) return standard;

  // Desktop app launched from Finder has limited PATH. Fall back to a
  // login shell that loads .zshrc so we pick up ~/.local/bin, /opt/homebrew, etc.
  return tryWhich("/bin/zsh", ["-l", "-c", `command -v ${cmd}`]);
}
