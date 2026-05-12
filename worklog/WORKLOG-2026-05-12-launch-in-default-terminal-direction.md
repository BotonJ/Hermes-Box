# WORKLOG-2026-05-12-Launch-in-Default-Terminal-Direction

**分支**: `feat/launch-in-default-terminal`
**日期**: 2026-05-12
**状态**: 方向待确认，暂停实施

---

## 背景

原 plan (`PLAN-2026-05-12-launch-in-default-terminal.md`) 目标：在 CLISelector 每张卡片上加按钮，点击后在 macOS 系统默认终端中打开新窗口执行 CLI 命令。

**已实现部分**（commit 已有）：
- `terminal.rs` — Rust 模块，生成 `.command` 脚本并 `open`
- `terminal-launch.ts` + `.test.ts` — TS invoke wrapper
- CLISelector 按钮 + CSS
- i18n keys

---

## 发现的问题

### 问题 1：每次点击新建终端实例（CRITICAL）

**现象**：点击 5 次 "Open in Terminal" → 打开 5 个 Terminal.app 窗口
**期望**：在同一终端窗口新增 tab，而非新建实例

**根因**：当前架构用 `open script.command` → macOS 为**每次调用创建独立进程**，没有机制复用窗口或 tab

**结论**：当前方案架构上无法满足"复用 tab"需求，需改方案

---

### 问题 2：iTerm2 未生效（MEDIUM）

**现象**：iTerm2 已设为 macOS 默认终端，但 HermesBox 打开的仍是 Terminal.app
**根因**：`.command` 文件类型在 macOS 中**硬绑定到 Terminal.app**，iTerm2 不会自动注册为 `.command` 处理程序。这是系统文件关联机制，与"默认终端"设置是两套不同的系统

**结论**：即使修复 shell escape，iTerm 方案仍不可行

---

### 问题 3：入口位置不合理（MEDIUM）

**原方案**：在每张 CLI 卡片右侧加按钮
**反馈**：
- 每个卡片都带按钮，视觉冗余
- 期望：Selector 中放**一张独立卡片**（Terminal 图标）
- 期望：在**已打开的 Hermes TAB 中**提供入口（右键菜单 / 工具栏）

---

## 需求对齐（讨论后）

| # | 需求 | 当前状态 | 说明 |
|---|------|---------|------|
| A | Selector 中独立 Terminal 卡片 | ❌ 未实现 | 单张卡片，不是每卡一个按钮 |
| B | Hermes TAB 内打开终端入口 | ❌ 未实现 | 需在 TabBar 或右键菜单加入口 |
| C | 在现有终端 tab 复用（不新建实例） | ❌ 架构不可行 | `.command` + `open` 无法控制窗口/tab |
| D | 尊重用户默认终端设置 | ❌ 方案不可行 | iTerm 不处理 `.command` 文件类型 |

---

## 待确认问题

1. **Terminal 卡片打开的 tab 内容是什么？**
   - Option A：执行选中的 CLI（如 `hermes`），用现有 PTY 模块
   - Option B：只开一个交互式 shell tab（`/bin/zsh -c "hermes"` 或纯 shell）

2. **Tab 内是 Hermes 还是原生 shell？**
   - 如果用 Hermes PTY module，可以复用现有 terminal tab 架构
   - 如果用 iTerm/Ghostty 方案，需要各平台适配

3. **和现有 Terminal Container 的关系？**
   - 现有的 terminal tab 是 Hermes PTY
   - 新增的 "Open Terminal" tab 是复用同一个 PTY pool，还是独立？

---

## 代码安全问题（MEDIUM）

### Shell Escape 漏洞未修复

**文件**: `src-tauri/src/terminal.rs:22`

**问题**: 命令通过 `"{}"` 双引号注入脚本，bash 双引号**不阻止 `$()` 命令替换**。

```
输入: hermes$(whoami)
实际执行: whoami (命令替换生效)
```

**修复方案**:

```rust
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

let script_content = format!(
    "#!/bin/bash\ncd \"$HOME\"\nexec {}\nexec $SHELL\nrm \"$0\"\n",
    shell_escape(command)
);
```

**状态**：发现但未修复，不阻塞讨论方向

---

## 下一步

等待产品方向确认后，再更新 plan 和实现方案。可能需要新的 plan 文档覆盖以下内容：

1. Selector 独立 Terminal 卡片设计
2. Tab 内打开终端入口设计
3. PTY 模块复用策略

**当前分支保留，代码 review 发现的问题记录在此，待方向确认后决定：废弃 / 继续修复 / 重写**
