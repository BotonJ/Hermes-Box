const STORAGE_KEY = "hermesbox:theme";

export type ThemeMode = "dark" | "light" | "system";
export type Theme = "dark" | "light";

let systemListener: (() => void) | null = null;

/** Returns the stored theme mode, defaulting to "dark". */
export function getThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "dark";
}

function applyTheme(mode: ThemeMode): void {
  let effective: Theme;
  if (mode === "system") {
    effective = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    effective = mode;
  }
  document.documentElement.dataset.theme = effective;
}

/** Sets the theme mode and updates the DOM. Subscribes to system changes when mode is "system". */
export function setThemeMode(mode: ThemeMode): void {
  if (systemListener) {
    window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", systemListener);
    systemListener = null;
  }

  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }

  applyTheme(mode);

  if (mode === "system") {
    systemListener = () => applyTheme("system");
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", systemListener);
  }
}

/** Returns the effective theme, resolving "system" to the current OS preference. */
export function getEffectiveTheme(): Theme {
  const mode = getThemeMode();
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

/** Initializes the theme system on app startup. */
export function initTheme(): void {
  setThemeMode(getThemeMode());
}

/** Returns the effective theme (alias for getEffectiveTheme). */
export function getTheme(): Theme {
  return getEffectiveTheme();
}
