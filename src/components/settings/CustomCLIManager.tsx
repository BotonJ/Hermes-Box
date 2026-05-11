import { useState } from "preact/hooks";
import {
  getCustomCLIs,
  addCustomCLI,
  removeCustomCLI,
  type CustomCLI,
} from "../../lib/custom-clis";
import { t } from "../../lib/i18n";
import styles from "../Settings.module.css";

export function CustomCLIManager() {
  const [items, setItems] = useState<CustomCLI[]>(getCustomCLIs);
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");

  function handleAdd() {
    const trimmedLabel = label.trim();
    const trimmedCommand = command.trim();
    if (!trimmedLabel || !trimmedCommand) return;
    addCustomCLI(trimmedLabel, trimmedCommand);
    setItems(getCustomCLIs());
    setLabel("");
    setCommand("");
  }

  function handleRemove(id: string) {
    removeCustomCLI(id);
    setItems(getCustomCLIs());
  }

  return (
    <div class={styles.customCliSection}>
      {items.length > 0 && (
        <ul class={styles.customCliList}>
          {items.map((item) => (
            <li key={item.id} class={styles.customCliItem}>
              <span class={styles.customCliLabel}>{item.label}</span>
              <span class={styles.customCliCommand}>{item.command}</span>
              <button
                class={styles.customCliRemove}
                onClick={() => handleRemove(item.id)}
                aria-label={`${t("settings.removeCli")} ${item.label}`}
              >
                x
              </button>
            </li>
          ))}
        </ul>
      )}
      <div class={styles.customCliForm}>
        <input
          class={styles.customCliInput}
          type="text"
          placeholder={t("settings.cliLabelPlaceholder")}
          value={label}
          onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
        />
        <input
          class={styles.customCliInput}
          type="text"
          placeholder={t("settings.cliCommandPlaceholder")}
          value={command}
          onInput={(e) => setCommand((e.target as HTMLInputElement).value)}
        />
        <button
          class={styles.configButton}
          type="button"
          onClick={handleAdd}
          disabled={!label.trim() || !command.trim()}
        >
          {t("settings.addCli")}
        </button>
      </div>
    </div>
  );
}
