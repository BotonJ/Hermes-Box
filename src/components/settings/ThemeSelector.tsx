import {
  type ThemeChoice,
  THEME_PRESETS,
} from "../../lib/theme";
import { t } from "../../lib/i18n";
import styles from "../Settings.module.css";

function themeLabel(theme: ThemeChoice): string {
  const key = `theme.${theme}`;
  const translated = t(key);
  // If translation missing, fall back to capitalized name
  return translated === key ? theme.charAt(0).toUpperCase() + theme.slice(1) : translated;
}

interface ThemeSelectorProps {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}

export function ThemeSelector({ choice, onChange }: ThemeSelectorProps) {
  function handleChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value as ThemeChoice;
    onChange(v);
  }

  return (
    <div class={styles.soundPicker}>
      <div class={styles.soundPickerRow}>
        <select
          class={styles.soundSelect}
          value={choice}
          onChange={handleChange}
        >
          {THEME_PRESETS.map((theme) => (
            <option key={theme} value={theme}>
              {themeLabel(theme)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
