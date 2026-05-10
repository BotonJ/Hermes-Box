const SHELL_METACHARACTERS_UNIX = /[`$|;&<>\\{}()!#~*?[\]]/;
const SHELL_METACHARACTERS_WINDOWS = /[`$|;&<>{}()!#~*?[\]]/;

export function validateCommandPath(command: string): string {
  if (!command || command.trim().length === 0) {
    throw new Error("Command path is empty");
  }

  if (command.includes("\n") || command.includes("\r")) {
    throw new Error("Command path contains newline characters");
  }

  const isUnixAbsolute = command.startsWith("/");
  const isWindowsAbsolute = /^[A-Za-z]:\\/.test(command);
  if (!isUnixAbsolute && !isWindowsAbsolute) {
    throw new Error(`Command path is not absolute: ${command}`);
  }

  const metacharCheck = isWindowsAbsolute ? SHELL_METACHARACTERS_WINDOWS : SHELL_METACHARACTERS_UNIX;
  if (metacharCheck.test(command)) {
    throw new Error(`Command path contains shell metacharacters: ${command}`);
  }

  if (command.includes("..")) {
    throw new Error(`Command path contains path traversal: ${command}`);
  }

  return command;
}

/** Passes command as-is for PTY input. validateCommandPath already rejects metacharacters. */
export function escapeForPty(command: string): string {
  return command;
}
