import { invoke } from "@tauri-apps/api/core";

export async function launchInTerminal(command: string): Promise<void> {
  if (!command.trim()) {
    throw new Error("CLI command cannot be empty");
  }
  await invoke("launch_in_terminal", { cli: command });
}
