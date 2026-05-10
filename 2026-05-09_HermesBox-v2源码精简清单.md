---
name: HermesBox v2 源码精简清单
description: v2-rebuild 分支从 v2-phase4-stable tag 以来的代码中，6 项不必要的复杂度/死代码，待清理
type: project
originSessionId: 9239faf1-d652-4e59-9126-69c84b655556
---
## 背景

分支 `v2-rebuild`，对比 tag `v2-phase4-stable`。核心改动：App.tsx 单终端 → 多 Tab + Welcome/CLISelector/TerminalView 提取。功能正确，但附带了不必要的代码。

## 待精简项

### 1. `env-capture.ts` — 完全未使用的死代码（~93 行）

`captureShellEnv`、`parseEnvOutput`、`mergeEnv`、`sanitizeEnv` 及其安全过滤列表，没有任何生产代码 import。`env-capture.test.ts` 也是配套的。

**Why:** 开发过程中为 CLI 检测准备的环境捕获模块，但实际用的是 `exec-lookup.ts` 直接查 PATH。

### 2. i18n 系统 — 过度设计 + 大量未使用 key（~120 行）

`i18n.ts` + `use-locale.ts` + `locales/en.json` + `locales/zh.json`，实际只被 Welcome 和 CLISelector 用了 7 个 key。locale 文件里有 ~20 个未使用 key（`settings.*`、`theme.*`、`terminal.*`、`approval.*`），对应功能不存在。无语言切换 UI，永远默认英文。

**How to apply:** 要么内联字符串，要么删除未使用 key + 加语言切换 UI。

### 3. `theme.ts` deprecated 函数仍在使用（~15 行）

三个 `@deprecated` 函数（`getTheme`、`setTheme`、`toggleTheme`）是实际调用点。新函数（`getEffectiveTheme`、`setThemeMode`、`initTheme`）没人用。`initTheme()` 未在启动时调用。

**How to apply:** 删除 deprecated 标记，统一到一套 API。

### 4. `useTerminalFit` 与 TerminalView ResizeObserver 重复

`use-terminal-fit.ts` 注册 `window.resize` + `ResizeObserver` 做 fit debounce。`TerminalView.tsx` 自己也有 `ResizeObserver`（line 164）做 terminal open 检测。两个 observer 监听同一个 container。

**How to apply:** 合并为一个 observer，或让 useTerminalFit 同时负责 open 检测。

### 5. TerminalView 键盘缩放功能（~25 行）

`fontSize` state + Ctrl+Plus/Minus 处理 + fontSize 同步 effect（line 36-65）。对终端面板来说可能不需要——用户可以用终端原生缩放。

### 6. `handleTabExit` — 多余包装（3 行）

```typescript
function handleTabExit(tabId: string) { handleTabClose(tabId); }
```

直接传 `handleTabClose` 即可。

## 其他（非源码）

- `DebugOverlay` + `debug-metrics.ts`（~260 行）— 开发调试工具，非产品功能
- `[DEBUG-*]` console.log（7 处）— 调试日志
- `TerminalView.tsx.fixed` — 备份文件
- `TEST/` 目录混合了测试代码和 ~4MB 调试数据
