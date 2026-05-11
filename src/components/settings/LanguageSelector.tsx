import styles from "../Settings.module.css";

interface LanguageSelectorProps {
  locale: "en" | "zh";
  onChange: (value: "en" | "zh") => void;
}

export function LanguageSelector({ locale, onChange }: LanguageSelectorProps) {
  function handleEn() { onChange("en"); }
  function handleZh() { onChange("zh"); }

  return (
    <fieldset class={styles.radioGroup}>
      <label class={styles.radioLabel}>
        <input
          type="radio"
          name="locale"
          value="en"
          class={styles.radioInput}
          checked={locale === "en"}
          onChange={handleEn}
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
          onChange={handleZh}
        />
        <span class={styles.radioCustom} />
        <span>中文</span>
      </label>
    </fieldset>
  );
}
