import { useState } from "preact/hooks";
import {
  applyHermesColors,
  resetHermesColors,
  getHermesCliPathStatus,
} from "../../lib/hermes-colors";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/use-locale";
import styles from "../Settings.module.css";

interface HermesColorsProps {
  effectiveTheme: "light" | "dark";
}

export function HermesColors({ effectiveTheme }: HermesColorsProps) {
  useLocale();
  const [message, setMessage] = useState<string | null>(null);
  const status = getHermesCliPathStatus();

  async function handleApply() {
    setMessage(null);
    const result = await applyHermesColors(effectiveTheme);
    setMessage(result);
  }

  async function handleReset() {
    setMessage(null);
    const result = await resetHermesColors();
    setMessage(result);
  }

  return (
    <div class={styles.soundPicker}>
      <div class={styles.configButtons}>
        <button class={styles.configButton} onClick={handleApply}>
          {t("settings.applyColors")}
        </button>
        <button class={styles.configButton} onClick={handleReset}>
          {t("settings.resetColors")}
        </button>
      </div>
      {status === "not-found" && (
        <p class={styles.sectionDesc}>{t("settings.hermesNotDetected")}</p>
      )}
      {message && (
        <p class={styles.configSuccess}>{message}</p>
      )}
    </div>
  );
}
