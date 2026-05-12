import type { ThemeChoice } from "./theme";

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

// Obsidian (Gruvbox Dark)
const OBSIDIAN: XtermTheme = {
  background: "#282828",
  foreground: "#ebdbb2",
  cursor: "#ebdbb2",
  cursorAccent: "#282828",
  selectionBackground: "#665c54",
  black: "#282828",
  red: "#cc241d",
  green: "#98971a",
  yellow: "#d79921",
  blue: "#458588",
  magenta: "#b16286",
  cyan: "#689d6a",
  white: "#a89984",
  brightBlack: "#928374",
  brightRed: "#fb4934",
  brightGreen: "#b8bb26",
  brightYellow: "#fabd2f",
  brightBlue: "#83a598",
  brightMagenta: "#d3869b",
  brightCyan: "#8ec07c",
  brightWhite: "#ebdbb2",
};

// macOS Grass (green-themed light palette)
const GRASS: XtermTheme = {
  background: "#487147",
  foreground: "#f4f4f4",
  cursor: "#f4f4f4",
  cursorAccent: "#ffffff",
  selectionBackground: "#3a6339",
  black: "#000000",
  red: "#cc241d",
  green: "#4e9a06",
  yellow: "#c8a900",
  blue: "#3465a4",
  magenta: "#75507b",
  cyan: "#06989a",
  white: "#d3d0c8",
  brightBlack: "#555753",
  brightRed: "#ef2929",
  brightGreen: "#8ae234",
  brightYellow: "#fce94f",
  brightBlue: "#729fcf",
  brightMagenta: "#ad7fa8",
  brightCyan: "#34e2e2",
  brightWhite: "#eeeeec",
};

// Ocean (blue-toned dark)
const OCEAN: XtermTheme = {
  background: "#0d1926",
  foreground: "#e0e8f0",
  cursor: "#4fc3f7",
  cursorAccent: "#0d1926",
  selectionBackground: "#1b3a52",
  black: "#0d1926",
  red: "#ef5350",
  green: "#66bb6a",
  yellow: "#ffa726",
  blue: "#42a5f5",
  magenta: "#ab47bc",
  cyan: "#26c6da",
  white: "#b0bec5",
  brightBlack: "#546e7a",
  brightRed: "#e57373",
  brightGreen: "#81c784",
  brightYellow: "#ffcc80",
  brightBlue: "#90caf9",
  brightMagenta: "#ce93d8",
  brightCyan: "#80deea",
  brightWhite: "#eceff1",
};

// Sunset (warm dark)
const SUNSET: XtermTheme = {
  background: "#1e120d",
  foreground: "#f5ece6",
  cursor: "#ffab40",
  cursorAccent: "#1e120d",
  selectionBackground: "#3d261e",
  black: "#1e120d",
  red: "#ef5350",
  green: "#81c784",
  yellow: "#ffca28",
  blue: "#64b5f6",
  magenta: "#ba68c8",
  cyan: "#4dd0e1",
  white: "#bcaaa4",
  brightBlack: "#8d6e63",
  brightRed: "#e57373",
  brightGreen: "#a5d6a7",
  brightYellow: "#ffe082",
  brightBlue: "#90caf9",
  brightMagenta: "#ce93d8",
  brightCyan: "#80deea",
  brightWhite: "#efebe9",
};

// Lavender (purple-toned dark)
const LAVENDER: XtermTheme = {
  background: "#141020",
  foreground: "#ece6f5",
  cursor: "#b388ff",
  cursorAccent: "#141020",
  selectionBackground: "#2c244a",
  black: "#141020",
  red: "#ef5350",
  green: "#69f0ae",
  yellow: "#ffd740",
  blue: "#7c4dff",
  magenta: "#ea80fc",
  cyan: "#64ffda",
  white: "#b39ddb",
  brightBlack: "#7e57c2",
  brightRed: "#e57373",
  brightGreen: "#b9f6ca",
  brightYellow: "#ffe57f",
  brightBlue: "#b388ff",
  brightMagenta: "#ea80fc",
  brightCyan: "#a7ffeb",
  brightWhite: "#f3e5f5",
};

// Gruvbox Dark
const GRUVBOX_DARK: XtermTheme = {
  background: "#282828",
  foreground: "#ebdbb2",
  cursor: "#ebdbb2",
  cursorAccent: "#282828",
  selectionBackground: "#665c54",
  black: "#282828",
  red: "#cc241d",
  green: "#98971a",
  yellow: "#d79921",
  blue: "#458588",
  magenta: "#b16286",
  cyan: "#689d6a",
  white: "#a89984",
  brightBlack: "#928374",
  brightRed: "#fb4934",
  brightGreen: "#b8bb26",
  brightYellow: "#fabd2f",
  brightBlue: "#83a598",
  brightMagenta: "#d3869b",
  brightCyan: "#8ec07c",
  brightWhite: "#ebdbb2",
};

// Atom One Light
const ATOM_ONE_LIGHT: XtermTheme = {
  background: "#fafafa",
  foreground: "#383a42",
  cursor: "#383a42",
  cursorAccent: "#fafafa",
  selectionBackground: "#baddf8",
  black: "#ffffff",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#d19a66",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#abb2bf",
  brightBlack: "#5c6370",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#d19a66",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};

// Flexoki Light
const FLEXOKI_LIGHT: XtermTheme = {
  background: "#fdf6e3",
  foreground: "#657b83",
  cursor: "#657b83",
  cursorAccent: "#fdf6e3",
  selectionBackground: "#eee8d5",
  black: "#f5f5f5",
  red: "#d95763",
  green: "#859900",
  yellow: "#b58900",
  blue: "#268bd2",
  magenta: "#d33682",
  cyan: "#2aa198",
  white: "#839496",
  brightBlack: "#657b83",
  brightRed: "#d95763",
  brightGreen: "#859900",
  brightYellow: "#b58900",
  brightBlue: "#268bd2",
  brightMagenta: "#d33682",
  brightCyan: "#2aa198",
  brightWhite: "#fdf6e3",
};

const THEMES: Record<ThemeChoice, XtermTheme> = {
  dark: OBSIDIAN,
  grass: GRASS,
  ocean: OCEAN,
  sunset: SUNSET,
  lavender: LAVENDER,
  "gruvbox-dark": GRUVBOX_DARK,
  "atom-one-light": ATOM_ONE_LIGHT,
  "flexoki-light": FLEXOKI_LIGHT,
  system: OBSIDIAN, // resolved at runtime by theme.ts
};

/** Returns the xterm theme for a given theme choice. */
export function getXtermTheme(choice: ThemeChoice): XtermTheme {
  return THEMES[choice] ?? OBSIDIAN;
}
