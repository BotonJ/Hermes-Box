import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "hermesbox:external-terminal";

export interface TerminalApp {
  name: string;
  bundle: string;
}

export function getExternalTerminal(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setExternalTerminal(bundle: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, bundle);
  } catch {
    // ignore
  }
}

export async function detectInstalledTerminals(): Promise<TerminalApp[]> {
  return invoke<TerminalApp[]>("detect_terminals");
}
