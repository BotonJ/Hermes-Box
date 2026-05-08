import en from "./locales/en.json";
import zh from "./locales/zh.json";

export type Locale = "en" | "zh";
type Messages = typeof en;

const STORAGE_KEY = "hermesbox:locale";
const listeners = new Set<() => void>();

const messages: Record<Locale, Messages> = { en, zh };

function getStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") {
      return stored;
    }
  } catch {
    // Ignore — localStorage may be unavailable in some environments
  }
  return "en";
}

function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore — localStorage may be unavailable in some environments
  }
}

/** Returns the currently active locale, defaulting to "en". */
export function getLocale(): Locale {
  return getStoredLocale();
}

/** Sets the active locale, persists it, and notifies listeners. */
export function setLocale(locale: Locale): void {
  storeLocale(locale);
  document.documentElement.dataset.locale = locale;
  for (const cb of listeners) cb();
}

/** Subscribe to locale changes. Returns an unsubscribe function. */
export function onLocaleChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Translates a dot-separated key into the active locale's string.
 * Returns the key itself if no translation is found.
 */
export function t(key: string): string {
  const locale = getStoredLocale();
  const keys = key.split(".");
  let value: unknown = messages[locale];

  for (const k of keys) {
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, k)) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }

  return typeof value === "string" ? value : key;
}
