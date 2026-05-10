# 状态快照 — 审核修复后、Bug 3 修复前

**日期**：2026-05-08
**HEAD**：`3ecf1ea` (fix: prevent tab switch from restarting CLI and add Shell option)
**工作区**：20 个文件已修改未提交（审核修复 + 安全加固）

## 已确认的状态

### 通过的检查

| 检查 | 结果 |
|------|------|
| `pnpm test` | 93 passed (8 files) |
| `pnpm typecheck` | 0 errors |
| `cargo test` | 27 passed |
| `cargo clippy -- -D warnings` | 0 warnings |
| `cargo fmt --check` | clean |

### 实机测试结果

| Bug | 状态 | 说明 |
|-----|------|------|
| Bug 1: 窄条 | **已修复** | absolute stacking 替代 display:contents |
| Bug 2: 黑屏/零尺寸 PTY | **已修复** | visibility:hidden 替代 display:none + ResizeObserver |
| Bug 3: WebGL context 耗尽 | **待修复** | 4+ tab 卡顿，7 tab 全黑屏，关闭后卡死 |
| 问题 B: 切换 tab CLI reset | **已修复** | visibility:hidden 保持容器尺寸，PTY 不重启 |
| 输入延迟 | **待修复** | 第 4 个 tab 开始输入卡顿，多 PTY 同时运行 |

### 待修复：Bug 3 + 输入延迟

共同根因：每个 tab 都持有 Terminal（WebGL context）+ PTY 进程。

**修复方向**：
1. 所有 tab 用 canvas 渲染器替代 WebGL（不受 context 数量限制）
2. 非活跃 tab 延迟 spawn PTY，或限制最大同时存活终端数

## 未提交改动清单

### 前端
- `src/lib/pty-attach.ts` — isCommandSafe 允许列表 + _init 接口 + exit 释放
- `src/lib/pty-attach.test.ts` — +27 isCommandSafe 参数化测试
- `src/App.test.tsx` — 新增 +12 核心状态机测试
- `src/App.tsx` — 移除 display:none 包装 div，直接渲染 TerminalView
- `src/App.module.css` — .content 添加 position:relative，移除 .tabPanel
- `src/components/TerminalView.tsx` — ResizeObserver + visibility:hidden
- `src/components/TerminalView.module.css` — absolute stacking
- `src/components/CLISelector.tsx` — export selectedCli
- `src/components/CLISelector.test.tsx` — afterEach signal 重置
- `src/test-setup.ts` — ResizeObserver polyfill
- `vitest.config.ts` — 启用 setupFiles
- `package.json` — 移除 @tauri-apps/plugin-shell

### 后端
- `src-tauri/src/lib.rs` — 移除 shell plugin + if-let-Err + show_and_focus
- `src-tauri/src/tray.rs` — Result 日志化
- `src-tauri/src/approval.rs` — is_safe_id + 文件权限 + 跨平台 + cleanup 扩展名
- `src-tauri/Cargo.toml` — 移除 shell + serde_yaml
- `src-tauri/capabilities/default.json` — 移除 shell:allow-open

### Bridge
- `bridge/claude-code-approval-bridge.sh` — printf + openssl rand + chmod 700
- `bridge/hermes-approval-bridge.sh` — printf + openssl rand + chmod 700
