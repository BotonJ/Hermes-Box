import styles from "../Settings.module.css";

interface LanguageSelectorProps {
  locale: "en" | "zh";
  onChange: (value: "en" | "zh") => void;
}

export function LanguageSelector({ locale, onChange }: LanguageSelectorProps) {
  return (
    <fieldset class={styles.radioGroup}>
      <label class={styles.radioLabel}>
        <input
          type="radio"
          name="locale"
          value="en"
          class={styles.radioInput}
          checked={locale === "en"}
          onChange={() => onChange("en")}
        />
        <span class={styles.radioCustom} />
        <span>English</span>
      </label>
      <label class={styles.radioLabel}>
        <input
          type="radio"
          name="locale"
          value="zh"
          class={styles.radioInput}
          checked={locale === "zh"}
          onChange={() => onChange("zh")}
        />
        <span class={styles.radioCustom} />
        <span>中文</span>
      </label>
    </fieldset>
  );
}
