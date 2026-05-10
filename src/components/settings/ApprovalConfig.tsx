import { t } from "../../lib/i18n";
import styles from "../Settings.module.css";

interface ApprovalConfigProps {
  bridgeDir: string;
  onBridgeDirChange: (value: string) => void;
  onGenerate: (type: "claude" | "hermes") => void;
  message: { type: "success" | "error"; message: string } | null;
}

export function ApprovalConfig({ bridgeDir, onBridgeDirChange, onGenerate, message }: ApprovalConfigProps) {
  return (
    <>
      <div class={styles.configRow}>
        <input
          class={styles.input}
          type="text"
          value={bridgeDir}
          placeholder={t("settings.bridgeDirectory")}
          onInput={(e) => onBridgeDirChange(e.currentTarget.value)}
        />
      </div>

      <div class={styles.configButtons}>
        <button class={styles.configButton} onClick={() => onGenerate("claude")}>
          {t("settings.generateClaude")}
        </button>
        <button class={styles.configButton} onClick={() => onGenerate("hermes")}>
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
