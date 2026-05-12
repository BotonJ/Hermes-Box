import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const HERMES_CLI =
  "/Users/dor/Downloads/Installers/hermes-agent-2026.4.23/hermes_cli";

/** 浅色主题下的 Hermes 颜色（当前硬编码值） */
const LIGHT_COLORS = { banner: "#C5A882", prompt: "#000000" };

/** 深色主题下的 Hermes 颜色（更深，可读） */
const DARK_COLORS = { banner: "#C5A882", prompt: "#FFF8DC" };

async function patchBanner(bannerColor: string): Promise<void> {
  const path = `${HERMES_CLI}/banner.py`;
  let content = await readTextFile(path);
  // 替换所有硬编码的 #C5A882 或 #6B5B4A 为目标颜色
  content = content.replace(/#C5A882|#6B5B4A|#FFF8DC/g, bannerColor);
  await writeTextFile(path, content);
}

async function patchSkinEngine(bannerColor: string, promptColor: string): Promise<void> {
  const path = `${HERMES_CLI}/skin_engine.py`;
  let content = await readTextFile(path);
  content = content.replace(
    /"banner_text":\s*"[^"]*"/,
    `"banner_text": "${bannerColor}"`,
  );
  content = content.replace(
    /"prompt":\s*"[^"]*"/,
    `"prompt": "${promptColor}"`,
  );
  await writeTextFile(path, content);
}

/**
 * 根据 HermesBox 主题更新 Hermes CLI 的颜色配置。
 * 浅色主题 → 还原为原始暖色；深色主题 → 切换为更深的可读色。
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
