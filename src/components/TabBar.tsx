import { t } from "../lib/i18n";
import { CLI_ICONS } from "../lib/cli-icons";
import { useLocale } from "../lib/use-locale";
import styles from "./TabBar.module.css";

export interface TabInfo {
  id: string;
  cliId: string;
  title: string;
}

interface TabBarProps {
  tabs: TabInfo[];
  activeId: string | null;
  settingsActive: boolean;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onSettings: () => void;
  onSettingsClose: () => void;
}

export function TabBar({ tabs, activeId, settingsActive, onSwitch, onClose, onAdd, onSettings, onSettingsClose }: TabBarProps) {
  useLocale();

  return (
    <div class={styles.wrapper}>
      <div class={styles.tabRow}>
        {tabs.map((tab) => {
          const handleSwitch = () => onSwitch(tab.id);
          const handleClose = (e: MouseEvent) => {
            e.stopPropagation();
            onClose(tab.id);
          };
          return (
            <button
              key={tab.id}
              class={`${styles.tab} ${tab.id === activeId ? styles.active : ""}`}
              onClick={handleSwitch}
            >
              <span class={styles.tabIcon}>
                  {tab.cliId in CLI_ICONS
                    ? <img src={CLI_ICONS[tab.cliId]} alt={tab.cliId} />
                    : ">"}
                </span>
              <span class={styles.tabTitle}>{tab.title}</span>
              <span
                class={styles.closeBtn}
                onClick={handleClose}
              >
                &times;
              </span>
            </button>
          );
        })}
        <button class={styles.addTab} onClick={onAdd} title="Open new tab">
          +
        </button>
        <button
          class={`${styles.tab} ${styles.settingsTab} ${settingsActive ? styles.active : ""}`}
          onClick={onSettings}
        >
          <span class={styles.tabIcon}>⚙️</span>
          <span class={styles.tabTitle}>{t("settings.title")}</span>
          <span
            class={styles.closeBtn}
            onClick={(e) => {
              e.stopPropagation();
              onSettingsClose();
            }}
          >
            &times;
          </span>
        </button>
      </div>
    </div>
  );
}
