import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { execLookup } from "./exec-lookup";

const HERMES_CLI_KEY = "hermesbox:hermes-cli-path";
const HERMES_WRAPPER_RE = /^(#!(.*)\/venv\/bin\/python)/;

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
 * Resolves the hermes_cli directory by running `which hermes` to find
 * the actual hermes binary, then reading its shebang to extract the
 * venv path and derive hermes_cli. Caches result to localStorage.
 */
export async function resolveHermesCliDir(): Promise<string> {
  const cached = getCachedPath();
  if (cached) {
    console.log("[hermes-colors] cached:", cached);
    try {
      await readTextFile(`${cached}/skin_engine.py`);
      return cached;
    } catch {
      console.log("[hermes-colors] cached path invalid, clearing:", cached);
      cachePath("");
    }
  }

  console.log("[hermes-colors] resolving via which hermes...");
  const hermesPath = await execLookup("hermes");
  if (!hermesPath) {
    console.log("[hermes-colors] which hermes returned nothing");
    return "";
  }
  console.log("[hermes-colors] which hermes:", hermesPath);

  // hermes might be a symlink — Tauri FS readTextFile blocks symlinks.
  // Try readTextFile first; if it fails (symlink), fall back to shell.
  let shebangLine = "";
  try {
    const content = await readTextFile(hermesPath);
    shebangLine = content.split("\n")[0];
    console.log("[hermes-colors] readTextFile ok, shebang:", shebangLine);
  } catch {
    console.log("[hermes-colors] readTextFile failed (symlink?), trying shell fallback...");
    try {
      const output = await Command.create("/bin/zsh", [
        "-l",
        "-c",
        'head -1 "$(which hermes)"',
      ]).execute();
      if (output.code === 0 && output.stdout.trim()) {
        shebangLine = output.stdout.trim();
        console.log("[hermes-colors] shell fallback ok, shebang:", shebangLine);
      }
    } catch {
      console.log("[hermes-colors] shell fallback also failed");
    }
  }

  const match = HERMES_WRAPPER_RE.exec(shebangLine);
  if (!match) {
    console.log("[hermes-colors] no venv path in shebang:", shebangLine);
    return "";
  }

  const resolved = `${match[2]}/hermes_cli`;
  console.log("[hermes-colors] resolved:", resolved);
  cachePath(resolved);
  return resolved;
}

/** Patch banner.py's banner_text color. Only matches hex color assignments. */
async function patchBanner(base: string, bannerColor: string): Promise<void> {
  const path = `${base}/banner.py`;
  try {
    const content = await readTextFile(path);
    const lines = content.split("\n");
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      // Match: text = "#RRGGBB" or text = _skin_color("banner_text", "#RRGGBB")
      // Do NOT match: text=True, text="some string", etc.
      if (/^\s*text\s*=\s*(?:"#[0-9a-fA-F]+"|_skin_color\()/i.test(lines[i])) {
        const indent = lines[i].match(/^(\s*)/)?.[1] ?? "";
        const newVal = `${indent}text = "${bannerColor}"`;
        if (lines[i] !== newVal) {
          lines[i] = newVal;
          changed = true;
        }
        break;
      }
    }
    if (changed) {
      console.log("[hermes-colors] writing patched banner.py");
      await writeTextFile(path, lines.join("\n"));
    }
  } catch (err) {
    console.log("[hermes-colors] patchBanner failed:", err);
  }
}

async function patchSkinEngine(base: string, bannerColor: string, promptColor: string): Promise<void> {
  const path = `${base}/skin_engine.py`;
  try {
    const content = await readTextFile(path);
    const bannerMatch = /"banner_text":\s*"([^"]*)"/.exec(content);
    const promptMatch = /"prompt":\s*"([^"]*)"/.exec(content);
    const currentBanner = bannerMatch?.[1] ?? "";
    const currentPrompt = promptMatch?.[1] ?? "";

    if (currentBanner === bannerColor && currentPrompt === promptColor) {
      console.log("[hermes-colors] skin_engine already up-to-date, skipping write");
      return;
    }

    let patched = content;
    if (currentBanner !== bannerColor) {
      patched = patched.replace(
        /"banner_text":\s*"[^"]*"/,
        `"banner_text": "${bannerColor}"`,
      );
    }
    if (currentPrompt !== promptColor) {
      patched = patched.replace(
        /"prompt":\s*"[^"]*"/,
        `"prompt": "${promptColor}"`,
      );
    }
    console.log("[hermes-colors] writing patched skin_engine.py");
    await writeTextFile(path, patched);
  } catch (err) {
    console.log("[hermes-colors] patchSkinEngine failed:", err);
  }
}

export async function applyHermesColors(theme: "light" | "dark"): Promise<string> {
  console.log("[hermes-colors] applyHermesColors called, theme:", theme);
  const base = await resolveHermesCliDir();
  if (!base) {
    console.log("[hermes-colors] no hermes path, skipping");
    return theme === "light"
      ? "Hermes colors → light mode"
      : "Hermes colors → dark mode";
  }
  const colors = theme === "light" ? LIGHT_COLORS : DARK_COLORS;
  console.log("[hermes-colors] colors:", JSON.stringify(colors));
  await patchBanner(base, colors.banner);
  await patchSkinEngine(base, colors.banner, colors.prompt);
  const msg = theme === "light"
    ? "Hermes colors → light mode"
    : "Hermes colors → dark mode";
  console.log("[hermes-colors] done:", msg);
  return msg;
}

export async function resetHermesColors(): Promise<string> {
  const base = await resolveHermesCliDir();
  if (!base) {
    console.log("[hermes-colors] no hermes path, skipping");
    return "Hermes colors → reset";
  }
  await patchBanner(base, RESET_COLORS.banner);
  await patchSkinEngine(base, RESET_COLORS.banner, RESET_COLORS.prompt);
  return "Hermes colors → reset";
}
