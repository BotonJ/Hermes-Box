# HANDOFF — Start 按钮修复计划

**日期**：2026-05-07
**状态**：待执行
**来源**：文档研究完成后的全代码库审计 + 实机测试失败分析

---

## 问题

点击 Start 按钮后终端空白无响应，无法进入 CLI。

## 根因链路

```
CLISelector.handleStart()
  → Tab { shell: "/bin/sh", command: cli.commands[0] }
  → addTab() → view = "terminal"
  → TerminalView → attachPty() → spawn("bin/sh", ...)
  → tauri-pty invoke('plugin:pty|spawn', ...)
  → ❌ plugin:pty 未注册，invoke 无 handler
  → TauriPty._init promise reject（无人 catch）
  → 终端空白，无错误，无反馈
```

## 三个断点

| # | 优先级 | 文件 | 问题 |
|---|--------|------|------|
| 1 | CRITICAL | `Cargo.toml` + `lib.rs` + `capabilities/default.json` | `tauri-plugin-pty` 未引入、未注册、无权限 |
| 2 | HIGH | `src/lib/pty-attach.ts` | `spawn()` 异步失败被静默吞掉；`onData`/`onExit` 返回 IDisposable 未清理 |
| 3 | MEDIUM | `src/components/CLISelector.tsx:19` | shell 硬编码 `/bin/sh`，macOS 应为 `/bin/zsh` |

## 修复计划（3 个 commit）

### Fix 1: 注册 tauri-plugin-pty

- `src-tauri/Cargo.toml` 加 `tauri-plugin-pty = "0.2"`
- `src-tauri/src/lib.rs` 加 `.plugin(tauri_plugin_pty::init())`
- `src-tauri/capabilities/default.json` 加 6 条 pty 权限

### Fix 2: 修复 pty-attach.ts 错误处理

- PtyProcess 接口加 `_init: Promise<void>` + `IDisposable`
- `proc._init.catch()` 写错误信息到终端
- cleanup 时 `dispose()` 事件监听
- 更新 mock 和测试（+3 新测试）

### Fix 3: shell 路径修正

- `CLISelector.tsx:19` `/bin/sh` → `/bin/zsh`
- 更新对应测试断言

## 验证

1. `cargo check` — Rust 编译通过
2. `pnpm test` — 53 tests 全绿
3. `pnpm typecheck` — 无类型错误
4. `pnpm tauri dev` — Start 后终端显示 shell prompt

## 已完成的文档研究（本轮）

17 个库/主题全部研究完毕，0 阻塞：
- `@testing-library/preact`、`vitest`、`@preact/preset-vite`、`jsdom vs happy-dom`
- `tauri-plugin-pty`、`portable-pty` 详细 API、Tauri v2 IPC 模式
- 记忆文件：`2026-05-07_HermesBox-v2文档研究续补.md`、`2026-05-07_HermesBox-PTY方案研究.md`

## 下一步

执行 Fix 1 → Fix 2 → Fix 3，每个独立 commit，最后实机验证。
