import { exists } from "@tauri-apps/plugin-fs";

export async function fileExists(path: string): Promise<boolean> {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}
