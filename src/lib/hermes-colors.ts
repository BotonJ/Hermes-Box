import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const HERMES_CLI_KEY = "hermesbox:hermes-cli-path";

function getHermesCliPath(): string {
  try {
    return localStorage.getItem(HERMES_CLI_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Light-theme Hermes colors (warm tones). */
const LIGHT_COLORS = { banner: "#C5A882", prompt: "#000000" };

/** Dark-theme Hermes colors (deeper, readable). */
const DARK_COLORS = { banner: "#C5A882", prompt: "#FFF8DC" };

async function patchBanner(bannerColor: string): Promise<void> {
  const base = getHermesCliPath();
  if (!base) return;
  const path = `${base}/banner.py`;
  try {
    let content = await readTextFile(path);
    const original = content;
    content = content.replace(/#C5A882|#6B5B4A|#FFF8DC/g, bannerColor);
    if (content !== original) {
      await writeTextFile(path, content);
    }
  } catch {
    // Hermes CLI not installed or file not accessible — skip silently
  }
}

async function patchSkinEngine(bannerColor: string, promptColor: string): Promise<void> {
  const base = getHermesCliPath();
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

/**
 * Updates Hermes CLI color config to match the current HermesBox theme.
 * Light theme → warm original colors; Dark theme → deeper readable colors.
 * No-op if Hermes CLI path is not configured.
 */
export async function applyHermesColors(
  theme: "light" | "dark",
): Promise<string> {
  const colors = theme === "light" ? LIGHT_COLORS : DARK_COLORS;
  await patchBanner(colors.banner);
  await patchSkinEngine(colors.banner, colors.prompt);
  return theme === "light"
    ? "Hermes colors → light mode"
    : "Hermes colors → dark mode";
}
