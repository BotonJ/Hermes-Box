import { invoke } from "@tauri-apps/api/core";

export async function launchInTerminal(command: string, terminal?: string): Promise<void> {
  if (!command.trim()) {
    throw new Error("CLI command cannot be empty");
  }
  const payload: { cli: string; terminal?: string } = { cli: command };
  if (terminal) {
    payload.terminal = terminal;
  }
  await invoke("launch_in_terminal", payload);
}
