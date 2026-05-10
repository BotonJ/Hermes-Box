interface Writer {
  write(data: string): void;
}

export function scheduleCommand(
  _pty: Writer,
  _term: Writer,
  _command: string,
  _validate: (cmd: string) => string,
  _escape: (cmd: string) => string,
  _delay = 400
): () => void {
  // No-op: command is now passed as shell args via Rust spawn (no echo issue)
  return () => {};
}
