import { Command } from "@tauri-apps/plugin-shell";

export async function runCommand(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  const command = Command.create(cmd, args);
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd}`)),
      timeoutMs,
    );
  });

  const output = await Promise.race([command.execute(), timeoutPromise]);
  clearTimeout(timerId);
  return output.stdout;
}
