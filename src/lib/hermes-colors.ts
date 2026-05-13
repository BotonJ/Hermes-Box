import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";

const HERMES_CLI_KEY = "hermesbox:hermes-cli-path";
const WRAPPER_PATH_SUFFIX = "/.local/bin/hermes";
const SHEBANG_RE = /#!(.*)\/venv\/bin\/python/;

/** Light-theme Hermes colors. */
const LIGHT_COLORS = { banner: "#C5A882", prompt: "#000000" };

/** Dark-theme Hermes colors. */
const DARK_COLORS = { banner: "#C5A882", prompt: "#FFF8DC" };

/** Hermes original/reset colors. */
const RESET_COLORS = { banner: "#FFF8DC", prompt: "#FFF8DC" };

function getCachedPath(): string {
  try {
    return localStorage.getItem(HERMES_CLI_KEY) ?? "";
  } catch {
    return "";
  }
}

function cachePath(path: string): void {
  try {
    localStorage.setItem(HERMES_CLI_KEY, path);
  } catch {
    // ignore
  }
}

/**
 * Resolves the hermes_cli directory by reading the shebang from the
 * `~/.local/bin/hermes` wrapper script. Caches result to localStorage.
 */
export async function resolveHermesCliDir(): Promise<string> {
  const cached = getCachedPath();
  if (cached) return cached;

  try {
    const home = await homeDir();
    const shebang = await readTextFile(`${home}${WRAPPER_PATH_SUFFIX}`);
    const match = SHEBANG_RE.exec(shebang);
    if (!match) return "";

    const resolved = `${match[1]}/hermes_cli`;
    cachePath(resolved);
    return resolved;
  } catch {
    return "";
  }
}

async function patchSkinEngine(bannerColor: string, promptColor: string): Promise<void> {
  const base = await resolveHermesCliDir();
  if (!base) return;
  const path = `${base}/skin_engine.py`;
  try {
    let content = await readTextFile(path);
    const original = content;
    content = content.replace(
      /"banner_text":\s*"[^"]*"/,
      `"banner_text": "${bannerColor}"`,
    );
    content = content.replace(
      /"prompt":\s*"[^"]*"/,
      `"prompt": "${promptColor}"`,
    );
    if (content !== original) {
      await writeTextFile(path, content);
    }
  } catch {
    // Hermes CLI not installed or file not accessible — skip silently
  }
}

export async function applyHermesColors(theme: "light" | "dark"): Promise<string> {
  const colors = theme === "light" ? LIGHT_COLORS : DARK_COLORS;
  await patchSkinEngine(colors.banner, colors.prompt);
  return theme === "light"
    ? "Hermes colors → light mode"
    : "Hermes colors → dark mode";
}

export async function resetHermesColors(): Promise<string> {
  await patchSkinEngine(RESET_COLORS.banner, RESET_COLORS.prompt);
  return "Hermes colors → reset";
}
