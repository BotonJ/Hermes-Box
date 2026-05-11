import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "preact/hooks";
import {
  SYSTEM_SOUNDS,
  type SoundChoice,
  type SystemSound,
  getClaudeSound,
  setClaudeSound,
  getHermesSound,
  setHermesSound,
  getClaudeCustomPath,
  setClaudeCustomPath,
  getHermesCustomPath,
  setHermesCustomPath,
  playSoundById,
} from "../../lib/sound";
import { t } from "../../lib/i18n";
import styles from "../Settings.module.css";

interface SoundSelectorProps {
  enabled: boolean;
  onToggle: () => void;
}

const SOUND_FILTERS = [
  { name: "Audio", extensions: ["mp3", "wav", "aiff", "ogg", "m4a", "flac"] },
];

function SoundPicker({
  label,
  value,
  customPath,
  onChange,
  onCustomPathChange,
}: {
  label: string;
  value: SoundChoice;
  customPath: string;
  onChange: (s: SoundChoice) => void;
  onCustomPathChange: (p: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [localCustomPath, setLocalCustomPath] = useState(customPath);

  async function handlePickFile() {
    const selected = await open({
      multiple: false,
      filters: SOUND_FILTERS,
    });
    if (selected) {
      setLocalCustomPath(selected);
      setLocalValue("custom");
      onCustomPathChange(selected);
      onChange("custom");
    }
  }

  async function handlePreview() {
    console.log("[SoundPicker] preview localValue:", localValue, "customPath:", localCustomPath);
    if (localValue === "custom" && localCustomPath) {
      await playSoundById(localCustomPath);
    } else {
      await playSoundById(localValue);
    }
  }

  function handleChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    if (v === "custom" || SYSTEM_SOUNDS.includes(v as SystemSound)) {
      setLocalValue(v as SoundChoice);
      onChange(v as SoundChoice);
    }
  }

  return (
    <div class={styles.soundPicker}>
      <label class={styles.soundPickerLabel}>{label}</label>
      <div class={styles.soundPickerRow}>
        <select
          class={styles.soundSelect}
          value={localValue}
          onChange={handleChange}
        >
          {SYSTEM_SOUNDS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="custom">
            {localCustomPath ? `Custom: ${shortenPath(localCustomPath)}` : "Custom..."}
          </option>
        </select>
        <button
          class={styles.previewButton}
          type="button"
          onClick={handlePreview}
          aria-label={`${t("settings.previewSound")} ${label}`}
        >
          {t("settings.previewSound")}
        </button>
        {localValue === "custom" && (
          <button
            class={styles.previewButton}
            type="button"
            onClick={handlePickFile}
          >
            {t("settings.chooseFile")}
          </button>
        )}
      </div>
    </div>
  );
}

function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return ".../" + parts.slice(-2).join("/");
}

export function SoundSelector({ enabled, onToggle }: SoundSelectorProps) {
  return (
    <div>
      <div class={styles.section}>
        <div class={styles.sectionLabel}>
          <p class={styles.sectionTitle}>{t("settings.approvalSound")}</p>
          <p class={styles.sectionDesc}>{t("settings.approvalSoundDesc")}</p>
        </div>
        <button
          class={styles.toggle}
          role="switch"
          aria-label={t("settings.approvalSound")}
          aria-checked={enabled}
          onClick={onToggle}
        >
          <span class={styles.toggleKnob} />
        </button>
      </div>
      {enabled && (
        <div class={styles.soundPickers}>
          <SoundPicker
            label="Claude Code"
            value={getClaudeSound()}
            customPath={getClaudeCustomPath()}
            onChange={setClaudeSound}
            onCustomPathChange={setClaudeCustomPath}
          />
          <SoundPicker
            label="Hermes"
            value={getHermesSound()}
            customPath={getHermesCustomPath()}
            onChange={setHermesSound}
            onCustomPathChange={setHermesCustomPath}
          />
        </div>
      )}
    </div>
  );
}
