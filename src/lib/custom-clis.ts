import type { CLIMeta } from "./cli-detect";

const STORAGE_KEY = "hermesbox:custom-clis";

export interface CustomCLI {
  id: string;
  label: string;
  command: string;
  args?: string;
}

export function getCustomCLIs(): CustomCLI[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is CustomCLI =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as CustomCLI).id === "string" &&
        typeof (item as CustomCLI).label === "string" &&
        typeof (item as CustomCLI).command === "string",
    );
  } catch {
    return [];
  }
}

export function addCustomCLI(label: string, command: string, args?: string): CustomCLI {
  const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
  const normalizedArgs = args?.trim() || undefined;
  const entry: CustomCLI = { id, label, command, args: normalizedArgs };
  const list = getCustomCLIs();
  list.push(entry);
  save(list);
  return entry;
}

export function removeCustomCLI(id: string): void {
  const list = getCustomCLIs().filter((c) => c.id !== id);
  save(list);
}

export function customCLIsToMeta(customs: CustomCLI[]): CLIMeta[] {
  return customs.map((c) => ({
    id: c.id,
    label: c.label,
    description: `Custom: ${c.command}${c.args ? ` ${c.args}` : ""}`,
    commands: [c.command],
    execArgs: c.args,
    fallbackPaths: { darwin: [], windows: [] },
  }));
}

function save(list: CustomCLI[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}
