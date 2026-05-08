import { useState, useEffect } from "preact/hooks";
import { platform } from "@tauri-apps/plugin-os";
import { homeDir } from "@tauri-apps/api/path";
import { Welcome } from "./components/Welcome";
import { CLISelector } from "./components/CLISelector";
import { TabBar, type TabInfo } from "./components/TabBar";
import { TerminalView } from "./components/TerminalView";
import { detectAllCLIs, CLI_REGISTRY, type DetectResult } from "./lib/cli-detect";
import { execLookup } from "./lib/exec-lookup";
import { fileExists } from "./lib/file-exists";

type View = "welcome" | "selector" | "terminal";

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
  const [cliResults, setCliResults] = useState<DetectResult[]>(() =>
    CLI_REGISTRY.map((m) => ({
      id: m.id,
      found: false,
      path: null,
      error: `${m.label} not found. Please install it first.`,
    })),
  );

  // Detect CLIs when entering selector view
  useEffect(() => {
    if (view !== "selector") return;

    const os = platform() === "windows" ? "windows" : "darwin";

    homeDir()
      .then((home) => detectAllCLIs(CLI_REGISTRY, os, execLookup, fileExists, home))
      .catch(() => detectAllCLIs(CLI_REGISTRY, os, execLookup, fileExists, ""))
      .then((results) => setCliResults(results));
  }, [view]);

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
          if (curIdx > 0) setActiveTabId(tabs[curIdx - 1].id);
        } else if (e.key === "]" || e.key === "}") {
          e.preventDefault();
          const curIdx = tabs.findIndex((t) => t.id === activeTabId);
          if (curIdx < tabs.length - 1) setActiveTabId(tabs[curIdx + 1].id);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabs, activeTabId]);

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
      addTab("shell", "Shell", shell, shellArgs, { TERM: "xterm-256color" }, "");
      return;
    }

    const meta = CLI_REGISTRY.find((m) => m.id === cliId);
    addTab(cliId, meta?.label ?? cliId, shell, shellArgs, { TERM: "xterm-256color" }, cliPath);
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
        setActiveTabId(next[Math.min(idx, next.length - 1)].id);
      }
      return next;
    });
  }

  function handleTabExit(tabId: string) {
    handleTabClose(tabId);
  }

  const showTabs = tabs.length > 0;

  return (
    <div class="app">
      {showTabs && (
        <TabBar
          tabs={tabs}
          activeId={activeTabId}
          settingsActive={false}
          onSwitch={handleTabSwitch}
          onClose={handleTabClose}
          onAdd={() => setView("selector")}
          onSettings={() => {}}
          onSettingsClose={() => {}}
        />
      )}
      {view === "welcome" && <Welcome onContinue={handleContinue} />}
      {view === "selector" && <CLISelector results={cliResults} onSelect={handleSelect} />}
      {view === "terminal" && showTabs && (
        <div style="flex: 1; overflow: hidden; position: relative;">
          {tabs.map((tab) => (
            <TerminalView
              key={tab.id}
              shell={tab.shell}
              shellArgs={tab.shellArgs}
              env={tab.env}
              command={tab.command}
              isActive={tab.id === activeTabId}
              onExit={() => handleTabExit(tab.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
