import { useEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import { useLocale } from "../lib/use-locale";
import styles from "./ContextMenu.module.css";

export const TAB_COLORS = [
  { name: "red", value: "#e74c3c" },
  { name: "orange", value: "#f39c12" },
  { name: "yellow", value: "#f1c40f" },
  { name: "green", value: "#2ecc71" },
  { name: "blue", value: "#3498db" },
  { name: "purple", value: "#9b59b6" },
  { name: "pink", value: "#e91e63" },
  { name: "gray", value: "#95a5a6" },
];

interface ContextMenuProps {
  x: number;
  y: number;
  locked: boolean;
  currentColor?: string;
  onClose: () => void;
  onToggleLock: () => void;
  onRename: () => void;
  onColorChange: (color: string | undefined) => void;
  onCopyTitle: () => void;
  onCloseTab: () => void;
  onCloseOtherTabs: () => void;
}

export function ContextMenu({
  x,
  y,
  locked,
  currentColor,
  onClose,
  onToggleLock,
  onRename,
  onColorChange,
  onCopyTitle,
  onCloseTab,
  onCloseOtherTabs,
}: ContextMenuProps) {
  useLocale();
  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp menu position to viewport
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  }, []);

  return (
    <>
      <div class={styles.overlay} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={menuRef} class={styles.menu} style={{ left: x, top: y }}>
        <button class={styles.item} onClick={() => { onToggleLock(); onClose(); }}>
          <span class={styles.itemIcon}>{locked ? "🔓" : "🔒"}</span>
          {locked ? t("contextMenu.unlock") : t("contextMenu.lock")}
        </button>
        <button class={styles.item} onClick={() => { onRename(); onClose(); }}>
          <span class={styles.itemIcon}>✏️</span>
          {t("contextMenu.rename")}
        </button>
        <div class={styles.colorSection}>
          <div class={styles.colorLabel}>{t("contextMenu.tabColor")}</div>
          <div class={styles.colorRow}>
            <button
              class={`${styles.colorDot} ${styles.colorDotClear} ${!currentColor ? styles.colorDotActive : ""}`}
              onClick={() => { onColorChange(undefined); onClose(); }}
              title="Clear"
            />
            {TAB_COLORS.map((c) => (
              <button
                key={c.name}
                class={`${styles.colorDot} ${currentColor === c.value ? styles.colorDotActive : ""}`}
                style={{ background: c.value }}
                onClick={() => { onColorChange(c.value); onClose(); }}
                title={c.name}
              />
            ))}
          </div>
        </div>
        <div class={styles.separator} />
        <button class={styles.item} onClick={() => { onCopyTitle(); onClose(); }}>
          <span class={styles.itemIcon}>📋</span>
          {t("contextMenu.copyTitle")}
        </button>
        <div class={styles.separator} />
        <button
          class={`${styles.item} ${locked ? styles.itemDisabled : ""}`}
          onClick={() => { if (!locked) { onCloseTab(); onClose(); } }}
        >
          <span class={styles.itemIcon}>✕</span>
          {t("contextMenu.closeTab")}
        </button>
        <button class={styles.item} onClick={() => { onCloseOtherTabs(); onClose(); }}>
          <span class={styles.itemIcon}>✕✕</span>
          {t("contextMenu.closeOtherTabs")}
        </button>
      </div>
    </>
  );
}
