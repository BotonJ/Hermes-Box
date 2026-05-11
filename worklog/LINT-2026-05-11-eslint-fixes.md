# Worklog: ESLint 修复 — Errors、React-Perf、Hooks 依赖

- **日期**: 2026-05-11
- **类型**: fix
- **前置**: `LINT-2026-05-11-oxlint-eslint-scan.md`（扫描结果）
- **结果**: 66 条 → 47 条（-19），0 errors，133 tests 全绿，typecheck 通过

---

## 修复清单

### Errors（2 → 0）

| 文件 | 修复 |
|------|------|
| `src/lib/debug-metrics.ts:25` | `let globalState` → `const globalState`（仅修改属性，未重赋值） |
| `src/components/TerminalView.tsx:8` | 添加 `eslint-disable-next-line no-control-regex`（ANSI 转义序列是终端解析必需的） |

### ApprovalPanel hooks 依赖（3 → 0）

| 行号 | 修复 |
|------|------|
| 72 | `requests.length > 0` 提取为 `hasRequests` 变量，消除复杂表达式依赖 |
| 108 | ref cleanup 复制 `timersRef.current` 到局部变量 `timers` |

### React-Perf 内联 prop（生产代码 22 → 8）

| 文件 | 修复方式 | 减少 |
|------|----------|------|
| `App.tsx` | `handleOpenSettings` / `handleCloseSettings` 提取为 `useCallback` | -2 |
| `ApprovalModal.tsx` | 拆分 `handleDecision` 为 `handleDeny` + `handleApprove` 独立函数 | -2 |
| `ApprovalPanel.tsx` | 同上拆分为 `handleDeny` + `handleApprove` | -2 |
| `CLISelector.tsx` | 提取 `handleSelectShell` 命名函数 | -1 |
| `Settings.tsx` | 提取 `handleThemeChange` / `handleLocaleChange` | -2 |
| `TabBar.tsx` | `.map()` 内提取 `handleSwitch` / `handleClose` 局部变量 | -3 |
| `Toast.tsx` | `.map()` 内提取 `handleDismiss` 局部变量 | -1 |
| `DebugOverlay.tsx` | 内联 style 对象提取为模块级常量 `hintStyle` / `copiedStyle` / `hiddenStyle` | -3 |
| `ApprovalConfig.tsx` | 提取 `handleInput` / `handleGenerateClaude` / `handleGenerateHermes` | -3 |
| `LanguageSelector.tsx` | 提取 `handleEn` / `handleZh` 命名函数 | -2 |
| `ThemeModeSelector.tsx` | `.map()` 内提取 `handleChange` 局部变量 | -1（仍有 1 条 map 闭包） |
| `TerminalView.tsx` | 内联 style 对象提取为 `hiddenTerminalStyle` 模块常量 | -1 |

### 其他 Hooks 修复（2 条）

| 文件 | 修复 |
|------|------|
| `use-toast.ts:38` | ref cleanup 复制 `timersRef.current` 到局部变量（与 ApprovalPanel 同模式） |
| `TerminalView.tsx:286` | 添加 `eslint-disable` 注释说明 `tabId` 为何非依赖（key={tab.id} 保证稳定） |

---

## 剩余 47 条分析

- **测试文件**: 37 条（react-perf 22 + no-explicit-any 9 + no-this-alias 1 + unused-disable 1 + stress-test 4）— 不影响运行时
- **不可避免的 map 闭包**: 8 条（TabBar 3 + ApprovalPanel 2 + App.tsx onExit 1 + ThemeModeSelector 1 + Toast 1）— `.map()` 内捕获 `id` 是标准模式
- **无生产代码 error**

---

## 新增/修改文件

- `eslint.config.js` — 新增 ESLint flat config
- `package.json` — 新增 devDeps: eslint, @eslint/js, typescript-eslint, react-hooks, react-perf, jsx-a11y
- 12 个组件文件修改（如上表）
