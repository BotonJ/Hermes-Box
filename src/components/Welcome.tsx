import { t } from "../lib/i18n";
import { useLocale } from "../lib/use-locale";
import styles from "./Welcome.module.css";

interface WelcomeProps {
  onContinue: () => void;
}

export function Welcome({ onContinue }: WelcomeProps) {
  useLocale();

  return (
    <div class={styles.container}>
      <div class={styles.content}>
        <div class={styles.icon}>📦</div>
        <h1 class={styles.title}>{t("app.welcome")}</h1>
        <p class={styles.subtitle}>{t("app.subtitle")}</p>
        <button class={styles.button} onClick={onContinue}>
          {t("app.getStarted")}
        </button>
      </div>
    </div>
  );
}
