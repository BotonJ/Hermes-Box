import type { ThemeMode } from "../../lib/theme";
import { t } from "../../lib/i18n";
import styles from "../Settings.module.css";

interface ThemeModeSelectorProps {
  mode: ThemeMode;
  onChange: (value: ThemeMode) => void;
}

export function ThemeModeSelector({ mode, onChange }: ThemeModeSelectorProps) {
  return (
    <fieldset class={styles.radioGroup}>
      {(["dark", "light", "system"] as ThemeMode[]).map((value) => (
        <label key={value} class={styles.radioLabel}>
          <input
            type="radio"
            name="theme-mode"
            value={value}
            class={styles.radioInput}
            checked={mode === value}
            onChange={() => onChange(value)}
          />
          <span class={styles.radioCustom} />
          <span>{t(`theme.${value}`)}</span>
        </label>
      ))}
    </fieldset>
  );
}
