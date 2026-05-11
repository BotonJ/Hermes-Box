const STORAGE_KEY = "hermesbox:approval-sound";

let audioCache: Map<string, HTMLAudioElement> = new Map();

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // ignore
  }
}

export function playApprovalSound(source: string): void {
  if (!isSoundEnabled()) return;
  try {
    const key = source === "hermes" ? "hermes" : "claude";
    let audio = audioCache.get(key);
    if (!audio) {
      const soundPath =
        key === "hermes"
          ? "/System/Library/Sounds/Glass.aiff"
          : "/System/Library/Sounds/Ping.aiff";
      audio = new Audio(`file://${soundPath}`);
      audioCache.set(key, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // Non-critical — never block approval flow
  }
}
