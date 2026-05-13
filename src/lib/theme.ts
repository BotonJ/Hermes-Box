const STORAGE_KEY = "hermesbox:theme";

/** All available theme presets. Each maps to a CSS data-theme value. */
export const THEME_PRESETS = [
  "dark",
  "grass",
  "ocean",
  "sunset",
  "lavender",
  "gruvbox-dark",
  "atom-one-light",
  "flexoki-light",
  "system",
] as const;

export type ThemeChoice = (typeof THEME_PRESETS)[number];
export type Theme = "dark" | "light";

let systemListener: (() => void) | null = null;
let lastSystemEffective: Theme | null = null;

/** True when systemListener has fired at least once (guards against stale initial matchMedia). */
let systemListenerFired = false;

function isThemePreset(v: string): v is ThemeChoice {
  return (THEME_PRESETS as readonly string[]).includes(v);
}

/** Returns the stored theme choice, migrating old "light" → "grass". Defaults to "dark". */
export function getTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Migrate old "light" value to "grass"
    if (stored === "light") {
      localStorage.setItem(STORAGE_KEY, "grass");
      return "grass";
    }
    if (stored && isThemePreset(stored)) return stored;
  } catch {
    // localStorage unavailable
  }
  return "dark";
}

/** Returns the CSS data-theme value for the current choice. */
function resolveDataTheme(choice: ThemeChoice): string {
  if (choice === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "gruvbox-dark" : "atom-one-light";
  }
  return choice;
}

function applyTheme(choice: ThemeChoice): void {
  document.documentElement.dataset.theme = resolveDataTheme(choice);
}

/** Sets the theme choice and updates the DOM. */
export function setTheme(choice: ThemeChoice): void {
  if (systemListener) {
    window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", systemListener);
    systemListener = null;
    lastSystemEffective = null;
  }

  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // ignore
  }

  applyTheme(choice);

  if (choice === "system") {
    lastSystemEffective = getEffectiveTheme();
    systemListenerFired = false;
    systemListener = () => {
      applyTheme("system");
      const newEffective = getEffectiveTheme();
      // Always apply on first fire (corrects stale initial matchMedia value),
      // then skip if unchanged on subsequent fires.
      if (systemListenerFired && newEffective === lastSystemEffective) {
        return;
      }
      systemListenerFired = true;
      lastSystemEffective = newEffective;
      import("./hermes-colors").then(({ applyHermesColors }) =>
        applyHermesColors(newEffective).catch(() => {}),
      );
    };
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", systemListener);
  }
}

/** Returns the effective theme (dark or light) for xterm and other consumers. */
export function getEffectiveTheme(): Theme {
  const dataTheme = resolveDataTheme(getTheme());
  // grass and atom-one-light are light themes; everything else is dark
  return dataTheme === "grass" || dataTheme === "atom-one-light" || dataTheme === "flexoki-light" ? "light" : "dark";
}

/** Initializes the theme system on app startup. */
export function initTheme(): void {
  setTheme(getTheme());
}
