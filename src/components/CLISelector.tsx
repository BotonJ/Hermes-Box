import { CLI_REGISTRY } from "../lib/cli-detect";
import type { DetectResult, CLIMeta } from "../lib/cli-detect";
import { getCustomCLIs, customCLIsToMeta } from "../lib/custom-clis";
import { t } from "../lib/i18n";
import { useLocale } from "../lib/use-locale";
import styles from "./CLISelector.module.css";

interface CLISelectorProps {
  results: DetectResult[];
  onSelect: (id: string, path: string) => void;
}

function buildFullRegistry(): CLIMeta[] {
  return [...CLI_REGISTRY, ...customCLIsToMeta(getCustomCLIs())];
}

export function CLISelector({ results, onSelect }: CLISelectorProps) {
  useLocale();
  const fullRegistry = buildFullRegistry();

  function getMeta(id: string) {
    return fullRegistry.find((m) => m.id === id);
  }

  function handleSelectShell() {
    onSelect("shell", "/bin/zsh");
  }

  return (
    <div class={styles.selector}>
      <div class={styles.header}>
        <h1 class={styles.heading}>{t("selector.heading")}</h1>
      </div>
      <div class={styles.grid}>
        {results
          .filter((r) => r.found)
          .map((result) => {
            const meta = getMeta(result.id);
            if (!meta) return null;

            return (
              <button
                key={result.id}
                class={styles.card}
                onClick={() => onSelect(result.id, result.path!)}
              >
                <div class={styles.icon}>
                  {result.id === "hermes" ? "⚡" : result.id === "claude" ? "🤖" : "💻"}
                </div>
                <div class={styles.info}>
                  <h2 class={styles.label}>{meta.label}</h2>
                  <p class={styles.description}>{meta.description}</p>
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
    </div>
  );
}
