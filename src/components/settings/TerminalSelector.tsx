import { useState, useEffect } from "preact/hooks";
import {
  detectInstalledTerminals,
  getExternalTerminal,
  setExternalTerminal,
  type TerminalApp,
} from "../../lib/external-terminal";
import { t } from "../../lib/i18n";
import styles from "../Settings.module.css";

export function TerminalSelector() {
  const [terminals, setTerminals] = useState<TerminalApp[]>([]);
  const [selected, setSelected] = useState(getExternalTerminal());

  useEffect(() => {
    detectInstalledTerminals()
      .then((apps) => setTerminals(apps))
      .catch(() => setTerminals([]));
  }, []);

  function handleChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    setSelected(value);
    setExternalTerminal(value);
  }

  return (
    <div class={styles.soundPicker}>
      <div class={styles.soundPickerRow}>
        <select
          class={styles.soundSelect}
          value={selected}
          onChange={handleChange}
        >
          <option value="">{t("settings.defaultTerminal")}</option>
          {terminals.map((app) => (
            <option key={app.bundle} value={app.bundle}>
              {app.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
