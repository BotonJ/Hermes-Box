import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { platform } from "@tauri-apps/plugin-os";
import { execLookup } from "./exec-lookup";

const HERMES_CLI_KEY = "hermesbox:hermes-cli-path";
const NOT_FOUND = "__not_found__";
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
  if (cached === NOT_FOUND) return "";
  if (cached) {
    try {
      await readTextFile(`${cached}/skin_engine.py`);
      return cached;
    } catch {
      cachePath("");
    }
  }

  const hermesPath = await execLookup("hermes");
  if (!hermesPath) {
    cachePath(NOT_FOUND);
    return "";
  }

  let shebangLine = "";
  try {
    const content = await readTextFile(hermesPath);
    shebangLine = content.split("\n")[0];
  } catch {
    // readTextFile fails on symlinks — fall back to shell
    const shell = platform() === "windows" ? "cmd.exe" : "/bin/zsh";
    const shellArgs = platform() === "windows"
      ? ["/c", `for /f "tokens=*" %i in ('where hermes') do @head -1 "%i"`]
      : ["-l", "-c", 'head -1 "$(which hermes)"'];
    try {
      const output = await Command.create(shell, shellArgs).execute();
      if (output.code === 0 && output.stdout.trim()) {
        shebangLine = output.stdout.trim();
      }
    } catch {
      // shell fallback also failed
    }
  }

  const match = HERMES_WRAPPER_RE.exec(shebangLine);
  if (!match) {
    cachePath(NOT_FOUND);
    return "";
  }

  const resolved = `${match[2]}/hermes_cli`;
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
      await writeTextFile(path, lines.join("\n"));
    }
  } catch {
    // banner.py not found or unreadable — skip
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
    await writeTextFile(path, patched);
  } catch {
    // skin_engine.py not found or unreadable — skip
  }
}

/** Serializes file writes to prevent concurrent interleaving. */
let writeChain: Promise<void> = Promise.resolve();

export function applyHermesColors(theme: "light" | "dark"): Promise<string> {
  const msg = theme === "light" ? "Hermes colors → light mode" : "Hermes colors → dark mode";
  let resolveResult!: (msg: string) => void;
  const result = new Promise<string>((r) => { resolveResult = r; });
  writeChain = writeChain.then(async () => {
    const base = await resolveHermesCliDir();
    if (base) {
      const colors = theme === "light" ? LIGHT_COLORS : DARK_COLORS;
      await patchBanner(base, colors.banner);
      await patchSkinEngine(base, colors.banner, colors.prompt);
    }
    resolveResult(msg);
  });
  return result;
}

export function resetHermesColors(): Promise<string> {
  const msg = "Hermes colors → reset";
  let resolveResult!: (msg: string) => void;
  const result = new Promise<string>((r) => { resolveResult = r; });
  writeChain = writeChain.then(async () => {
    const base = await resolveHermesCliDir();
    if (base) {
      await patchBanner(base, RESET_COLORS.banner);
      await patchSkinEngine(base, RESET_COLORS.banner, RESET_COLORS.prompt);
    }
    resolveResult(msg);
  });
  return result;
}
