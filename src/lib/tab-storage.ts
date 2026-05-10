const STORAGE_TABS = "hermesbox:tabs";
const STORAGE_RESTORE = "hermesbox:restore-tabs";

export interface TabMeta {
  cliId: string;
  title: string;
  shell: string;
  shellArgs: string[];
  env: Record<string, string>;
  command: string;
}

export function saveTabs(tabs: TabMeta[]): void {
  try {
    localStorage.setItem(STORAGE_TABS, JSON.stringify(tabs));
  } catch {
    // ignore
  }
}

export function loadTabs(): TabMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_TABS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is TabMeta =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as TabMeta).cliId === "string" &&
        typeof (item as TabMeta).title === "string" &&
        typeof (item as TabMeta).shell === "string" &&
        Array.isArray((item as TabMeta).shellArgs) &&
        typeof (item as TabMeta).env === "object" &&
        typeof (item as TabMeta).command === "string",
    );
  } catch {
    return [];
  }
}

export function clearTabs(): void {
  try {
    localStorage.removeItem(STORAGE_TABS);
  } catch {
    // ignore
  }
}

export function isRestoreEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_RESTORE) === "true";
  } catch {
    return false;
  }
}

export function setRestoreEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_RESTORE, String(enabled));
  } catch {
    // ignore
  }
}
