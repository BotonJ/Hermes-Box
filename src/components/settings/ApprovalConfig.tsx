import { t } from "../../lib/i18n";
import styles from "../Settings.module.css";

interface ApprovalConfigProps {
  bridgeDir: string;
  onBridgeDirChange: (value: string) => void;
  onGenerate: (type: "claude" | "hermes") => void;
  message: { type: "success" | "error"; message: string } | null;
}

export function ApprovalConfig({ bridgeDir, onBridgeDirChange, onGenerate, message }: ApprovalConfigProps) {
  function handleInput(e: Event) {
    onBridgeDirChange((e.target as HTMLInputElement).value);
  }

  function handleGenerateClaude() {
    onGenerate("claude");
  }

  function handleGenerateHermes() {
    onGenerate("hermes");
  }

  return (
    <>
      <div class={styles.configRow}>
        <input
          class={styles.input}
          type="text"
          value={bridgeDir}
          placeholder={t("settings.bridgeDirectory")}
          onInput={handleInput}
        />
      </div>

      <div class={styles.configButtons}>
        <button class={styles.configButton} onClick={handleGenerateClaude}>
          {t("settings.generateClaude")}
        </button>
        <button class={styles.configButton} onClick={handleGenerateHermes}>
          {t("settings.generateHermes")}
        </button>
      </div>

      {message && (
        <p class={message.type === "success" ? styles.configSuccess : styles.configError}>
          {message.message}
        </p>
      )}
    </>
  );
}
