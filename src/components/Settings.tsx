import { useState, useEffect } from "preact/hooks";
import { homeDir } from "@tauri-apps/api/path";
import {
  enableAutostart,
  disableAutostart,
  isAutostartEnabled,
} from "../lib/autostart";
import { generateApprovalConfig, setupBridgeDir } from "../lib/approval-bridge";
import {
  getThemeMode,
  setThemeMode,
  type ThemeMode,
} from "../lib/theme";
import { getLocale, setLocale, t } from "../lib/i18n";
import { useLocale } from "../lib/use-locale";
import { isRestoreEnabled, setRestoreEnabled } from "../lib/tab-storage";
import { isSoundEnabled, setSoundEnabled } from "../lib/sound";
import { ThemeModeSelector } from "./settings/ThemeModeSelector";
import { LanguageSelector } from "./settings/LanguageSelector";
import { ApprovalConfig } from "./settings/ApprovalConfig";
import styles from "./Settings.module.css";

interface SettingsProps {
  onBack: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Operation failed";
}

export function Settings({ onBack }: SettingsProps) {
  useLocale();
  const [autostart, setAutostart] = useState(false);
  const [restoreTabs, setRestoreTabs] = useState(isRestoreEnabled());
  const [approvalSound, setApprovalSound] = useState(isSoundEnabled());
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode());
  const [locale, setLocaleState] = useState(getLocale());
  const [error, setError] = useState<string | null>(null);
  const [bridgeDir, setBridgeDir] = useState("");
  const [configMsg, setConfigMsg] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    isAutostartEnabled().then(setAutostart).catch(() => setAutostart(false));
  }, []);

  useEffect(() => {
    homeDir().then((home) => {
      const dir = `${home}/.hermesbox/bridge`;
      setBridgeDir((prev) => prev || dir);
      setupBridgeDir(dir).catch(() => {});
    });
  }, []);

  async function handleToggle() {
    const next = !autostart;
    setError(null);
    try {
      if (next) await enableAutostart();
      else await disableAutostart();
      setAutostart(next);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  function handleToggleRestore() {
    const next = !restoreTabs;
    setRestoreEnabled(next);
    setRestoreTabs(next);
  }

  function handleToggleSound() {
    const next = !approvalSound;
    setSoundEnabled(next);
    setApprovalSound(next);
  }

  async function handleGenerateConfig(type: "claude" | "hermes") {
    setConfigMsg(null);
    try {
      await generateApprovalConfig(type, bridgeDir);
      setConfigMsg({ type: "success", message: t("settings.success") });
    } catch (err: unknown) {
      setConfigMsg({ type: "error", message: getErrorMessage(err) });
    }
  }

  function handleThemeChange(v: ThemeMode) {
    setThemeMode(v);
    setThemeModeState(v);
  }

  function handleLocaleChange(v: "en" | "zh") {
    setLocale(v);
    setLocaleState(v);
  }

  return (
    <div class={styles.container}>
      <div class={styles.header}>
        <button class={styles.backButton} onClick={onBack} aria-label={t("settings.back")}>
          {t("settings.back")}
        </button>
        <h1 class={styles.title}>{t("settings.title")}</h1>
      </div>

      <div class={styles.section}>
        <div class={styles.sectionLabel}>
          <p class={styles.sectionTitle}>{t("settings.launchAtLogin")}</p>
          <p class={styles.sectionDesc}>{t("settings.launchAtLoginDesc")}</p>
        </div>
        <button
          class={styles.toggle}
          role="switch"
          aria-label="Launch at Login"
          aria-checked={autostart}
          onClick={handleToggle}
        >
          <span class={styles.toggleKnob} />
        </button>
      </div>

      {error && <p class={styles.error}>{error}</p>}

      <div class={styles.section}>
        <div class={styles.sectionLabel}>
          <p class={styles.sectionTitle}>{t("settings.sessionRestore")}</p>
          <p class={styles.sectionDesc}>{t("settings.sessionRestoreDesc")}</p>
        </div>
        <button
          class={styles.toggle}
          role="switch"
          aria-label={t("settings.sessionRestore")}
          aria-checked={restoreTabs}
          onClick={handleToggleRestore}
        >
          <span class={styles.toggleKnob} />
        </button>
      </div>

      <div class={styles.section}>
        <div class={styles.sectionLabel}>
          <p class={styles.sectionTitle}>{t("settings.approvalSound")}</p>
          <p class={styles.sectionDesc}>{t("settings.approvalSoundDesc")}</p>
        </div>
        <button
          class={styles.toggle}
          role="switch"
          aria-label={t("settings.approvalSound")}
          aria-checked={approvalSound}
          onClick={handleToggleSound}
        >
          <span class={styles.toggleKnob} />
        </button>
      </div>

      <div class={styles.section}>
        <div class={styles.sectionLabel}>
          <p class={styles.sectionTitle}>{t("settings.appearance")}</p>
          <p class={styles.sectionDesc}>{t("settings.appearanceDesc")}</p>
        </div>
      </div>

      <ThemeModeSelector
        mode={themeMode}
        onChange={handleThemeChange}
      />

      <div class={styles.section}>
        <div class={styles.sectionLabel}>
          <p class={styles.sectionTitle}>{t("settings.language")}</p>
          <p class={styles.sectionDesc}>{t("settings.languageDesc")}</p>
        </div>
      </div>

      <LanguageSelector
        locale={locale}
        onChange={handleLocaleChange}
      />

      <div class={styles.section}>
        <div class={styles.sectionLabel}>
          <p class={styles.sectionTitle}>{t("settings.approvalConfig")}</p>
          <p class={styles.sectionDesc}>{t("settings.approvalConfigDesc")}</p>
        </div>
      </div>

      <ApprovalConfig
        bridgeDir={bridgeDir}
        onBridgeDirChange={setBridgeDir}
        onGenerate={handleGenerateConfig}
        message={configMsg}
      />
    </div>
  );
}
