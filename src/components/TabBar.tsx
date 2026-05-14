import { useState, useRef, useEffect } from "preact/hooks";
import { t } from "../lib/i18n";
import { getCLIIcon } from "../lib/cli-icons";
import { useLocale } from "../lib/use-locale";
import { ContextMenu } from "./ContextMenu";
import styles from "./TabBar.module.css";

export interface TabInfo {
  id: string;
  cliId: string;
  title: string;
  customTitle?: string;
  color?: string;
  locked?: boolean;
  command?: string;
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
  onToggleLock: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onColorChange: (id: string, color: string | undefined) => void;
  onCopyTitle: (id: string) => void;
  onCloseOtherTabs: (id: string) => void;
  onOpenExternalTerminal: (id: string) => void;
}

interface MenuState {
  tabId: string;
  x: number;
  y: number;
}

export function TabBar({
  tabs,
  activeId,
  settingsActive,
  onSwitch,
  onClose,
  onAdd,
  onSettings,
  onSettingsClose,
  onToggleLock,
  onRename,
  onColorChange,
  onCopyTitle,
  onCloseOtherTabs,
  onOpenExternalTerminal,
}: TabBarProps) {
  useLocale();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  function handleContextMenu(e: MouseEvent, tabId: string) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ tabId, x: e.clientX, y: e.clientY });
  }

  function startRename(tab: TabInfo) {
    setRenamingId(tab.id);
    setRenameValue(tab.customTitle ?? tab.title);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }

  function cancelRename() {
    setRenamingId(null);
  }

  function getTab(tabId: string) {
    return tabs.find((t) => t.id === tabId);
  }

  return (
    <div class={styles.wrapper}>
      <div class={styles.tabRow}>
        {tabs.map((tab) => {
          const handleSwitch = () => onSwitch(tab.id);
          const handleClose = (e: MouseEvent) => {
            e.stopPropagation();
            onClose(tab.id);
          };
          const isRenaming = renamingId === tab.id;
          const displayName = tab.customTitle ?? tab.title;

          return (
            <button
              key={tab.id}
              class={`${styles.tab} ${tab.id === activeId ? styles.active : ""}`}
              style={tab.color ? { borderTopColor: tab.color, borderTopWidth: "2px", borderTopStyle: "solid" } : undefined}
              onClick={handleSwitch}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              aria-label={displayName}
            >
              {tab.locked && <span class={styles.lockIcon} aria-hidden="true">🔒</span>}
              <span class={styles.tabIcon}>
                <img src={getCLIIcon(tab.cliId, tab.command)} alt={tab.cliId} />
              </span>
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  class={styles.renameInput}
                  value={renameValue}
                  onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                  onBlur={commitRename}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span class={styles.tabTitle}>{displayName}</span>
              )}
              {!tab.locked && (
                <span class={styles.closeBtn} onClick={handleClose} aria-label={`Close ${displayName}`}>
                  &times;
                </span>
              )}
            </button>
          );
        })}
        <button class={styles.addTab} onClick={onAdd} aria-label="Open new tab">
          +
        </button>
        <button
          class={`${styles.tab} ${styles.settingsTab} ${settingsActive ? styles.active : ""}`}
          onClick={onSettings}
          aria-label={t("settings.title")}
        >
          <span class={styles.tabIcon} aria-hidden="true">⚙️</span>
          <span class={styles.tabTitle}>{t("settings.title")}</span>
          <span
            class={styles.closeBtn}
            onClick={(e) => {
              e.stopPropagation();
              onSettingsClose();
            }}
            aria-label={`Close ${t("settings.title")}`}
          >
            &times;
          </span>
        </button>
      </div>
      {menu && (() => {
        const tab = getTab(menu.tabId);
        if (!tab) return null;
        return (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            locked={tab.locked ?? false}
            hasCommand={!!tab.command}
            currentColor={tab.color}
            onClose={() => setMenu(null)}
            onToggleLock={() => onToggleLock(tab.id)}
            onRename={() => startRename(tab)}
            onColorChange={(color) => onColorChange(tab.id, color)}
            onCopyTitle={() => onCopyTitle(tab.id)}
            onOpenExternalTerminal={() => onOpenExternalTerminal(tab.id)}
            onCloseTab={() => onClose(tab.id)}
            onCloseOtherTabs={() => onCloseOtherTabs(tab.id)}
          />
        );
      })()}
    </div>
  );
}
