import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { platform } from "@tauri-apps/plugin-os";
import { homeDir } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import { Welcome } from "./components/Welcome";
import { CLISelector } from "./components/CLISelector";
import { TabBar, type TabInfo } from "./components/TabBar";
import { TerminalView } from "./components/TerminalView";
import { Settings } from "./components/Settings";
import { ApprovalPanel } from "./components/ApprovalPanel";
import { ToastContainer } from "./components/Toast";
import { detectAllCLIs, CLI_REGISTRY, type DetectResult } from "./lib/cli-detect";
import { captureShellEnv, mergeEnv } from "./lib/env-capture";
import { execLookup } from "./lib/exec-lookup";
import { fileExists } from "./lib/file-exists";
import { runCommand } from "./lib/run-command";
import {
  listenForApprovals,
  approveCommand,
  denyCommand,
  listPendingApprovals,
  type ApprovalRequest,
} from "./lib/approval-bridge";
import { saveTabs, loadTabs, isRestoreEnabled } from "./lib/tab-storage";
import { useToast } from "./lib/use-toast";
import { playApprovalSound } from "./lib/sound";
import styles from "./App.module.css";

type View = "welcome" | "selector" | "terminal" | "settings";

interface Tab extends TabInfo {
  shell: string;
  shellArgs: string[];
  env: Record<string, string>;
  command: string;
}

const STORAGE_WELCOME = "hermesbox:welcomed";

function wasWelcomed(): boolean {
  try {
    return localStorage.getItem(STORAGE_WELCOME) === "true";
  } catch {
    return false;
  }
}

function markWelcomed(): void {
  try {
    localStorage.setItem(STORAGE_WELCOME, "true");
  } catch {
    // ignore
  }
}

function getShell(): [string, string[]] {
  const isWindows = platform() === "windows";
  return isWindows ? ["powershell.exe", []] : ["/bin/zsh", ["-l"]];
}

export function App() {
  const [view, setView] = useState<View>(wasWelcomed() ? "selector" : "welcome");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const { toasts, show: showToast, dismiss: dismissToast } = useToast();
  const [cliResults, setCliResults] = useState<DetectResult[]>(() =>
    CLI_REGISTRY.map((m) => ({
      id: m.id,
      found: false,
      path: null,
      error: `${m.label} not found. Please install it first.`,
    })),
  );

  // Listen for navigate-settings event from tray
  useEffect(() => {
    const unlisten = listen("navigate-settings", () => {
      setView("settings");
    });
    return () => { unlisten.then((fn) => fn()).catch(() => {}); };
  }, []);

  // Listen for approval requests from Rust backend
  useEffect(() => {
    const unlisten = listenForApprovals((request) => {
      setPendingApprovals((prev) => [...prev, request]);
      playApprovalSound(request.source ?? "claude");
    });
    return () => { unlisten.then((fn) => fn()).catch(() => {}); };
  }, []);

  // Reconcile pending approvals on mount
  useEffect(() => {
    listPendingApprovals()
      .then((requests) => {
        if (requests.length > 0) {
          setPendingApprovals((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const fresh = requests.filter((r) => !existingIds.has(r.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      })
      .catch((err) => { console.warn("Approval reconciliation failed:", err); });
  }, []);

  // Restore saved tabs on mount if enabled
  useEffect(() => {
    if (!isRestoreEnabled()) return;
    const saved = loadTabs();
    if (saved.length === 0) return;
    const restored: Tab[] = saved.map((meta) => ({
      id: crypto.randomUUID(),
      ...meta,
    }));
    setTabs(restored);
    setActiveTabId(restored[0].id);
    setView("terminal");
  }, []);

  // Persist tabs whenever they change (skip mount to avoid overwriting saved tabs)
  const saveSkipFirst = useRef(true);
  useEffect(() => {
    if (saveSkipFirst.current) {
      saveSkipFirst.current = false;
      return;
    }
    saveTabs(tabs.map(({ cliId, title, shell, shellArgs, env, command }) => ({
      cliId, title, shell, shellArgs, env, command,
    })));
  }, [tabs]);

  // Keyboard shortcuts: Cmd+1..9, Cmd+Shift+[/]
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (!e.shiftKey && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < tabs.length) {
          e.preventDefault();
          setActiveTabId(tabs[idx].id);
          setView("terminal");
        }
        return;
      }

      if (e.shiftKey) {
        if (e.key === "[" || e.key === "{") {
          e.preventDefault();
          const curIdx = tabs.findIndex((t) => t.id === activeTabId);
          if (curIdx > 0) {
            setActiveTabId(tabs[curIdx - 1].id);
            setView("terminal");
          }
        } else if (e.key === "]" || e.key === "}") {
          e.preventDefault();
          const curIdx = tabs.findIndex((t) => t.id === activeTabId);
          if (curIdx < tabs.length - 1) {
            setActiveTabId(tabs[curIdx + 1].id);
            setView("terminal");
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabs, activeTabId]);

  // Detect CLIs when entering selector view
  useEffect(() => {
    if (view !== "selector") return;

    const os = platform() === "windows" ? "windows" : "darwin";

    homeDir()
      .then((home) => detectAllCLIs(CLI_REGISTRY, os, execLookup, fileExists, home))
      .catch(() => detectAllCLIs(CLI_REGISTRY, os, execLookup, fileExists, ""))
      .then((results) => setCliResults(results));
  }, [view]);

  function addTab(
    cliId: string,
    title: string,
    shell: string,
    shellArgs: string[],
    env: Record<string, string>,
    command: string,
  ) {
    const id = crypto.randomUUID();
    setTabs((prev) => [...prev, { id, cliId, title, shell, shellArgs, env, command }]);
    setActiveTabId(id);
    setView("terminal");
  }

  function handleContinue() {
    markWelcomed();
    setView("selector");
  }

  function handleSelect(cliId: string, cliPath: string) {
    const [shell, shellArgs] = getShell();

    if (cliId === "shell") {
      captureShellEnv(runCommand)
        .then((shellEnv) => {
          const env = mergeEnv(shellEnv, { TERM: "xterm-256color" });
          addTab("shell", "Shell", shell, shellArgs, env, "");
        })
        .catch(() => {
          addTab("shell", "Shell", shell, shellArgs, { TERM: "xterm-256color" }, "");
        });
      return;
    }

    const meta = CLI_REGISTRY.find((m) => m.id === cliId);
    captureShellEnv(runCommand)
      .then((shellEnv) => {
        const env = mergeEnv(shellEnv, { TERM: "xterm-256color" });
        addTab(cliId, meta?.label ?? cliId, shell, shellArgs, env, cliPath);
      })
      .catch(() => {
        addTab(cliId, meta?.label ?? cliId, shell, shellArgs, { TERM: "xterm-256color" }, cliPath);
      });
  }

  function handleTabSwitch(id: string) {
    setActiveTabId(id);
    setView("terminal");
  }

  function handleTabClose(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        setActiveTabId(null);
        setView("selector");
      } else if (activeTabId === id) {
        const idx = prev.findIndex((t) => t.id === id);
        const newActive = next[Math.min(idx, next.length - 1)].id;
        setActiveTabId(newActive);
        if (view === "settings") {
          setView("terminal");
        }
      }
      return next;
    });
  }

  function handleTabExit(tabId: string) {
    handleTabClose(tabId);
  }

  function handleAddTab() {
    setView("selector");
  }

  function handleBackFromSettings() {
    setView(tabs.length > 0 ? "terminal" : "selector");
  }

  async function handleApprove(id: string) {
    setApprovalError(null);
    try {
      await approveCommand(id);
      setPendingApprovals((prev) => prev.filter((r) => r.id !== id));
      showToast("success", "Command approved");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval failed";
      setApprovalError(msg);
      showToast("error", msg);
    }
  }

  async function handleDeny(id: string) {
    setApprovalError(null);
    try {
      await denyCommand(id);
      setPendingApprovals((prev) => prev.filter((r) => r.id !== id));
      showToast("success", "Command denied");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to deny command";
      setApprovalError(msg);
      showToast("error", msg);
    }
  }

  const showTabs = tabs.length > 0;

  const handleOpenSettings = useCallback(() => setView("settings"), []);
  const handleCloseSettings = useCallback(() => {
    if (tabs.length > 0) {
      setActiveTabId(tabs[tabs.length - 1].id);
      setView("terminal");
    } else {
      setView("selector");
    }
  }, [tabs]);

  return (
    <div class={styles.app}>
      <ApprovalPanel
        requests={pendingApprovals}
        error={approvalError}
        onApprove={handleApprove}
        onDeny={handleDeny}
      />
      {showTabs && (
        <TabBar
          tabs={tabs}
          activeId={view === "settings" ? null : activeTabId}
          settingsActive={view === "settings"}
          onSwitch={handleTabSwitch}
          onClose={handleTabClose}
          onAdd={handleAddTab}
          onSettings={handleOpenSettings}
          onSettingsClose={handleCloseSettings}        />
      )}
      {view === "welcome" && (
        <div class={styles.contentArea}>
          <Welcome onContinue={handleContinue} />
        </div>
      )}
      {view === "settings" && (
        <div class={styles.contentArea}>
          <Settings onBack={handleBackFromSettings} />
        </div>
      )}
      {view === "selector" && (
        <div class={styles.contentArea}>
          <CLISelector results={cliResults} onSelect={handleSelect} />
        </div>
      )}
      {showTabs && (
        <div
          class={view === "terminal" ? styles.terminalContainer : `${styles.terminalContainer} ${styles.terminalContainerHidden}`}
        >
          {tabs.map((tab) => (
            <TerminalView
              key={tab.id}
              tabId={tab.id}
              tabTitle={tab.title}
              shell={tab.shell}
              shellArgs={tab.shellArgs}
              env={tab.env}
              command={tab.command}
              isActive={tab.id === activeTabId}
              onExit={() => handleTabExit(tab.id)}            />
          ))}
        </div>
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
