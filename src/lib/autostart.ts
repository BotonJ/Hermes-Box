import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";

function wrapError(context: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${context}: ${message}`);
}

export async function enableAutostart(): Promise<void> {
  try {
    await enable();
  } catch (err: unknown) {
    throw wrapError("Failed to enable autostart", err);
  }
}

export async function disableAutostart(): Promise<void> {
  try {
    await disable();
  } catch (err: unknown) {
    throw wrapError("Failed to disable autostart", err);
  }
}

export async function isAutostartEnabled(): Promise<boolean> {
  try {
    return await isEnabled();
  } catch (err: unknown) {
    throw wrapError("Failed to check autostart status", err);
  }
}
