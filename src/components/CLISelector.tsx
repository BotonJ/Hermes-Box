import type { DetectResult } from "../lib/cli-detect";
import { CLI_REGISTRY } from "../lib/cli-detect";
import { t } from "../lib/i18n";
import { useLocale } from "../lib/use-locale";
import styles from "./CLISelector.module.css";

interface CLISelectorProps {
  results: DetectResult[];
  onSelect: (id: string, path: string) => void;
}

function getMeta(id: string) {
  return CLI_REGISTRY.find((m) => m.id === id);
}

export function CLISelector({ results, onSelect }: CLISelectorProps) {
  useLocale();

  function handleSelectShell() {
    onSelect("shell", "/bin/zsh");
  }

  return (
    <div class={styles.selector}>
      <div class={styles.header}>
        <h1 class={styles.heading}>{t("selector.heading")}</h1>
      </div>
      {results.map((result) => {
        const meta = getMeta(result.id);
        if (!meta) return null;

        const disabled = !result.found;
        const handleClick = disabled
          ? undefined
          : () => onSelect(result.id, result.path!);

        return (
          <button
            key={result.id}
            class={`${styles.card} ${disabled ? styles.disabled : ""} cli-card`}
            onClick={handleClick}
            disabled={disabled}
          >
            <div class={styles.icon}>
              {result.id === "hermes" ? "⚡" : "🤖"}
            </div>
            <div class={styles.info}>
              <h2 class={styles.label}>{meta.label}</h2>
              <p class={styles.description}>{meta.description}</p>
              {disabled && result.error && (
                <p class={styles.error}>{result.error}</p>
              )}
            </div>
          </button>
        );
      })}
      <button
        key="shell"
        class={styles.card}
        onClick={handleSelectShell}
      >
        <div class={styles.icon}>⬛</div>
        <div class={styles.info}>
          <h2 class={styles.label}>{t("cli.shell")}</h2>
          <p class={styles.description}>{t("cli.shellDesc")}</p>
        </div>
      </button>
    </div>
  );
}
