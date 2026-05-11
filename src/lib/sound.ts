const STORAGE_ENABLED = "hermesbox:approval-sound";
const STORAGE_CLAUDE_SOUND = "hermesbox:sound-claude";
const STORAGE_HERMES_SOUND = "hermesbox:sound-hermes";
const STORAGE_CLAUDE_CUSTOM = "hermesbox:sound-claude-custom";
const STORAGE_HERMES_CUSTOM = "hermesbox:sound-hermes-custom";

export const SYSTEM_SOUNDS = [
  "Basso",
  "Blow",
  "Bottle",
  "Frog",
  "Funk",
  "Glass",
  "Hero",
  "Morse",
  "Ping",
  "Pop",
  "Purr",
  "Sosumi",
  "Submarine",
  "Tink",
] as const;

export type SystemSound = (typeof SYSTEM_SOUNDS)[number];

/** A sound selection: either a system sound name or "custom" (backed by a file path). */
export type SoundChoice = SystemSound | "custom";

const DEFAULT_CLAUDE_SOUND: SoundChoice = "Ping";
const DEFAULT_HERMES_SOUND: SoundChoice = "Glass";

let audioCache: Map<string, HTMLAudioElement> = new Map();

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_ENABLED) === "true";
  } catch {
    return false;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_ENABLED, String(enabled));
  } catch {
    // ignore
  }
}

// --- Claude sound ---

export function getClaudeSound(): SoundChoice {
  try {
    const stored = localStorage.getItem(STORAGE_CLAUDE_SOUND);
    if (stored === "custom" || (stored && SYSTEM_SOUNDS.includes(stored as SystemSound))) {
      return stored as SoundChoice;
    }
  } catch {
    // ignore
  }
  return DEFAULT_CLAUDE_SOUND;
}

export function setClaudeSound(sound: SoundChoice): void {
  try {
    localStorage.setItem(STORAGE_CLAUDE_SOUND, sound);
  } catch {
    // ignore
  }
}

export function getClaudeCustomPath(): string {
  try {
    return localStorage.getItem(STORAGE_CLAUDE_CUSTOM) ?? "";
  } catch {
    return "";
  }
}

export function setClaudeCustomPath(path: string): void {
  try {
    localStorage.setItem(STORAGE_CLAUDE_CUSTOM, path);
  } catch {
    // ignore
  }
}

// --- Hermes sound ---

export function getHermesSound(): SoundChoice {
  try {
    const stored = localStorage.getItem(STORAGE_HERMES_SOUND);
    if (stored === "custom" || (stored && SYSTEM_SOUNDS.includes(stored as SystemSound))) {
      return stored as SoundChoice;
    }
  } catch {
    // ignore
  }
  return DEFAULT_HERMES_SOUND;
}

export function setHermesSound(sound: SoundChoice): void {
  try {
    localStorage.setItem(STORAGE_HERMES_SOUND, sound);
  } catch {
    // ignore
  }
}

export function getHermesCustomPath(): string {
  try {
    return localStorage.getItem(STORAGE_HERMES_CUSTOM) ?? "";
  } catch {
    return "";
  }
}

export function setHermesCustomPath(path: string): void {
  try {
    localStorage.setItem(STORAGE_HERMES_CUSTOM, path);
  } catch {
    // ignore
  }
}

// --- Playback ---

export function playSoundById(soundId: string): void {
  try {
    let audio = audioCache.get(soundId);
    if (!audio) {
      if (SYSTEM_SOUNDS.includes(soundId as SystemSound)) {
        audio = new Audio(`file:///System/Library/Sounds/${soundId}.aiff`);
      } else {
        // Treat as custom file path
        audio = new Audio(`file://${soundId}`);
      }
      audioCache.set(soundId, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // Non-critical
  }
}

/** Play the configured sound for a given source. */
function resolveSoundPath(choice: SoundChoice, customPath: string): string {
  if (choice === "custom" && customPath) return customPath;
  return choice;
}

export function playApprovalSound(source: string): void {
  if (!isSoundEnabled()) return;
  const isHermes = source === "hermes";
  const choice = isHermes ? getHermesSound() : getClaudeSound();
  const customPath = isHermes ? getHermesCustomPath() : getClaudeCustomPath();
  const soundId = resolveSoundPath(choice, customPath);
  playSoundById(soundId);
}
