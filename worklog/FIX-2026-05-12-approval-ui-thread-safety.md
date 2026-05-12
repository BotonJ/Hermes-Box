# 审批卡片彩虹圈修复

**日期**：2026-05-12
**类型**：fix
**状态**：已修复
**标签**：`hermes-box-v2` | `approval` | `thread-safety` | `macOS`

---

## 问题

审批卡片触发时鼠标变彩虹圈，整个应用卡顿。

## 根因

`approval.rs` 的 fs watcher 运行在后台线程，检测到新审批文件时直接调用
`window::show_and_focus_main_window(&app)`。macOS 窗口 API（unminimize/show/setFocus）
必须在主线程执行，跨线程调用导致主线程阻塞。

## 修复

将窗口操作从 Rust 后台线程移到前端主线程：

1. **Rust 端**（`approval.rs:159`）：用 `app.emit("show-main-window", ())` 替代
   `window::show_and_focus_main_window(&app)`，移除 `use crate::window`
2. **前端**（`App.tsx`）：新增 `show-main-window` 事件监听，通过 Tauri 窗口 API
   执行 unminimize → show → setFocus（在浏览器主线程安全执行）
3. **Rust 端**（`window.rs:283`）：`show_and_focus_main_window` 添加 `#[allow(dead_code)]`
   保留备用（tray/single-instance 场景仍可使用）

## 测试

- 前端：156 passed
- Rust：43 passed
- typecheck：通过
- cargo check：通过（24 warnings 均为预存的 objc macro 警告）

## 文件变更

- `src-tauri/src/approval.rs` — 移除窗口调用，改用 emit 事件
- `src-tauri/src/window.rs` — dead_code 标记
- `src/App.tsx` — 新增 show-main-window 事件监听

## 参考

- 原始 issue：`worklog/ISSUE-2026-05-12-approval-ui-thread-safety.md`
