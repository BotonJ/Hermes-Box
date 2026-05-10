# DIAG: HermesBox v2 全面 Bug 审计

**日期**: 2026-05-11
**分支**: v2-rebuild
**触发**: 用户要求全面诊断

---

## 用户报告的实际 Bug（已修复）

### FIX-A: Shell prompt 显示异常

**现象**: Shell 启动后显示 `% (base) \[\]> \[\]`。Claude/Hermes 启动后额外显示 `"/opt/homebrew/bin/claude"`。

**根因**（三重）:

1. **`%` 残留**: `env-capture.ts` 使用 `-lic`（交互模式）捕获环境变量，zsh 交互模式会输出 PROMPT_SP `%` 字符 → 改为 `-lc`
2. **`\[\]` 转义序列**: bash PS1 中的 `\[` `\]` 是非打印字符定界符，xterm.js 不识别 → 在 `sanitizeEnv` 中 strip 掉
3. **额外路径文本**: `escapeForPty` 把命令用双引号包裹 `"path"`，shell 回显输入时显示引号 → 改为直接传入命令（`validateCommandPath` 已拒绝元字符）

**修改文件**:
- `src/lib/env-capture.ts`: `-lic` → `-lc`，`sanitizeEnv` 清理 PS1 中的 `\[\]`
- `src/lib/validate-command.ts`: `escapeForPty` 不再包裹双引号
- 测试同步更新

---

### FIX-B: 审批配置按钮失效

**现象**: Settings 中 "Generate Claude/Hermes Config" 按钮无效果。

**根因**: `Settings.tsx:47` bridge 目录路径缺少 `/` 分隔符 — `${home}.hermesbox/bridge`（错误）→ `${home}/.hermesbox/bridge`（正确）。实际解析为 `/Users/dor.hermesbox/bridge` 而非 `/Users/dor/.hermesbox/bridge`。

**修改文件**:
- `src/components/Settings.tsx:47`: 添加缺失的 `/`

---

### FIX-C: 新增 tab 清空所有已存在 tab

**现象**: 新增 tab 时，所有已存在 tab 的终端内容被清空重置。

**根因**: `App.tsx:334` 条件式渲染 `{showTabs && view === "terminal" && ...}`。当用户点 "+" 新增 tab 时，`view` 先变成 `"selector"`，导致整个 `terminalContainer` 被 Preact 卸载 → 所有 TerminalView cleanup 触发（kill PTY + dispose terminal）。用户选择 CLI 后 `view` 变回 `"terminal"`，但终端已销毁，从头重建。

**修复**: 终端容器始终渲染（只要 `showTabs`），通过 CSS `visibility` 控制可见性，而非条件式挂载/卸载。

**修改文件**:
- `src/App.tsx`: 终端容器从 `{showTabs && view === "terminal" && ...}` 改为 `{showTabs && <div style={view !== "terminal" ? { visibility: "hidden" } : undefined}>}`。`isActive` 也改为不依赖 `view === "terminal"`。

---

## 审计范围

- Rust 后端：pty.rs, window.rs, tray.rs, approval.rs, lib.rs, main.rs
- 前端：App.tsx, TerminalView.tsx, TabBar.tsx, ApprovalPanel.tsx, Settings.tsx
- 基础库：lib/pty.ts, lib/approval-bridge.ts, lib/tab-storage.ts, lib/use-toast.ts
- CSS：App.module.css, TabBar.module.css, ApprovalPanel.module.css

## 验证状态

- `pnpm test`: 133 tests passed (17 files)
- `pnpm typecheck`: 通过
- `cargo check`: 通过（34 warnings）
- `pnpm tauri dev`: 应用正常启动

---

## P0 — 必须修复

### BUG-1: PTY resize 完全无效

**文件**: `src-tauri/src/pty.rs:136-145`

`pty_resize` command 是空操作。`PtySession` struct 没有存储 PTY master handle，导致无法调用 `resize()`。

```rust
// 当前代码 — 完全 no-op
pub async fn pty_resize(...) -> Result<(), String> {
    let _ = (&sessions, &session_id, cols, rows);
    Ok(())
}
```

**根因**: `PtySession` 只存了 `writer`（`Box<dyn Write>`），丢弃了 `pair.master`。`portable_pty` 的 resize 需要通过 master handle 的 `PtyPair::master::resize()` 方法。

**影响**: 终端不会跟随窗口大小调整，列/行数始终是 spawn 时的值。

---

### BUG-2: Settings tab 无条件显示

**文件**: `src/components/TabBar.tsx:55-70`

Settings tab 在 TabBar 中无条件渲染，即使没有任何终端 tab。用户看到空 TabBar 只有一个 Settings 按钮。

**影响**: UX 不一致 — TabBar 本应在有终端时才显示（App.tsx:290 `const showTabs = tabs.length > 0`），但 Settings tab 破坏了这个逻辑。

---

## P1 — 应该修复

### BUG-3: Window is_visible 默认值不一致

**文件**: `src-tauri/src/window.rs:285`

`show_and_focus_main_window` 使用 `unwrap_or(true)` — 如果 `is_visible()` 返回错误，默认认为窗口可见，不会执行 show 逻辑。

```rust
// window.rs:285 — 错误的默认值
if !window.is_visible().unwrap_or(true) {  // 出错时跳过 show

// window.rs:255 (toggle) — 正确的默认值
if !window.is_visible().unwrap_or(false) {  // 出错时执行 show
```

**影响**: 审批请求到来时，如果 `is_visible()` 恰好出错，窗口不会弹出，用户无法看到审批面板。

---

### BUG-4: Tray 菜单初始标签错误

**文件**: `src-tauri/src/tray.rs:10`

Tray 菜单硬编码 "Show HermesBox"，不根据窗口实际可见状态初始化。

```rust
let show_hide = MenuItem::with_id(app, "show_hide", "Show HermesBox", true, None::<&str>)?;
```

如果应用启动时窗口已经可见，菜单仍然显示 "Show" 而不是 "Hide"。只有用户点击后才更新。

**影响**: 菜单文字与实际状态不符，但功能正常（点击后 toggle 会修正标签）。

---

### BUG-5: Approval watcher 读取未完成的文件

**文件**: `src-tauri/src/approval.rs:148-149`

文件系统 watcher 在收到 `Create` 事件后立即 `read_to_string`，但写入端（bridge script）可能还没写完。

```rust
if let (Some(id), Ok(raw)) = (
    path.file_stem().and_then(|s| s.to_str()),
    std::fs::read_to_string(path),  // 可读到不完整的 JSON
) {
```

如果 bridge script 的 `write → rename` 之间有延迟，或者文件系统事件的时机不对，可能读到空文件或截断的 JSON。

**影响**: 间歇性 — 大多数情况下 Create 事件在 rename 之后触发，但不是所有文件系统都保证这点。

---

### BUG-6: TabBar 无 overflow 处理

**文件**: `src/components/TabBar.module.css`

`.tabRow` 是 `display: flex` 但没有 `overflow-x` 或滚动机制。打开 10+ tab 时，tab 按钮会无限缩小到不可用。

**影响**: 重度使用时 tab 不可读、不可点击。

---

## P2 — 建议修复

### BUG-7: Rust 34 个未使用常量警告

**文件**: `src-tauri/src/window.rs:130-136`

`#[cfg(target_os = "macos")]` 块中有 7 个未使用的 NS 常量，加上 `apply_vibrancy_to_content` 等未使用的 unsafe 函数，共产生 34 个编译警告。

**影响**: 不影响功能，但污染编译输出，可能掩盖真正的警告。

---

### BUG-8: HOME 环境变量 panic

**文件**: `src-tauri/src/approval.rs:36-37`

```rust
let home = std::env::var("HOME")
    .expect("HOME environment variable not set — required for approval system");
```

在 HOME 不存在的极端环境下（容器、CI），`expect` 会 panic 整个进程。

**影响**: 低概率 — macOS 总有 HOME，但不符合 Rust 错误处理最佳实践。

---

### BUG-9: Approval watcher 线程用 `thread::park()` 永久阻塞

**文件**: `src-tauri/src/approval.rs:181-183`

```rust
loop {
    std::thread::park();
}
```

`thread::park()` 不是标准的 "keep thread alive" 方式。如果收到虚假 unpark，线程会短暂循环但无实际开销。问题在于语义不清晰 — 读者会疑惑为什么用 park 而不是其他同步原语。

更好的方式：用 `std::sync::Barrier`、`Condvar::wait`，或直接 `thread::sleep(Duration::MAX)`。

**影响**: 功能正确但代码意图不清，维护成本略高。

---

## 次要观察（非 Bug）

以下问题在分析中发现但不构成 bug，记录供参考：

1. **TerminalView ResizeObserver/useLayoutEffect 双重 spawn 守卫**：实际有 `if (!ptyRef.current)` 守卫，不会重复 spawn。分析正确但不是 bug。
2. **ApprovalPanel auto-deny race**：`processingRef` 检查在 setTimeout 回调和用户点击之间存在理论竞争窗口，但 `onDeny` 是幂等操作（filter + invoke），实际无害。
3. **approve_command / deny_command 返回值**：这两个函数正确使用了 Rust 隐式返回 `write_result_file(...)` 的 `Result<(), String>`，不需要 `?`。之前分析有误。
