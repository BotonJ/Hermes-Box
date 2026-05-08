interface Writer {
  write(data: string): void;
}

export function scheduleCommand(
  pty: Writer,
  term: Writer,
  command: string,
  validate: (cmd: string) => string,
  escape: (cmd: string) => string,
  delay = 400
): () => void {
  const timer = setTimeout(() => {
    try {
      const safeCommand = validate(command);
      pty.write(escape(safeCommand) + "\n");
    } catch {
      term.write("\r\n[Error: Invalid command path]\r\n");
    }
  }, delay);

  return () => clearTimeout(timer);
}
