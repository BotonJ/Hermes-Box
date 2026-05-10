# FIX: Phase 6 运行时崩溃修复 + Tray/窗口位置修复

**日期**: 2026-05-10
**分支**: fix/window-scroll-and-tab-shortcuts
**状态**: 完成

## 问题

Phase 6 编译通过、37 Rust 测试全过，但 `pnpm tauri dev` 启动后立即退出（SIGTRAP 133）。

## 根因分析

### SIGTRAP (exit 133)
- **崩溃点**: `apply_ns_panel_style()` 在 `std::thread::spawn` 中调用
- **根因**: `ns_window()` 触及 WebKit 内部 API，WebKit 的 Link Decoration Filtering (WebPrivacy) 要求主线程调用
- **堆栈**: Thread 23（tokio 线程池）→ IPC::Encoder::grow → SIGTRAP

### Foreign Exception Abort (exit 134)
- 尝试用 `run_on_main_thread` 修复后，ObjC 异常在主线程抛出
- Rust 无法捕获 foreign exception → 进程 abort
- 启用 `objc` crate 的 `exception` feature 后，`msg_send!` 内部 `panic!()` 但 ABI 不允许 unwind → 仍然 abort

### 最终方案
暂时禁用 NSPanel 样式（透明标题栏 + 毛玻璃），核心功能不受影响。后续用 `window-vibrancy` 插件或 `objc2` crate 替代。

## 修复内容

### 1. Tray 左键点击 (`tray.rs`)
- **问题**: macOS 左键默认弹菜单，toggle 被覆盖
- **修复**: 添加 `show_menu_on_left_click(false)`

### 2. 窗口位置持久化 (`lib.rs`)
- **问题**: 关闭窗口只 hide 不保存位置
- **修复**: `on_window_event` 的 `CloseRequested` 中保存位置后再 hide

### 3. NSPanel 样式禁用 (`lib.rs`)
- 注释掉 `apply_ns_panel_style` 调用
- 保留代码供后续参考

## 测试结果

```
Rust:      37 tests passed
Frontend: 127 tests passed
```

## 运行时验证

| 功能 | 结果 |
|------|------|
| 应用启动 | 通过（之前 SIGTRAP） |
| Tray 菜单 | 通过 |
| Tray 左键切换 | 通过 |
| 关闭→隐藏 | 通过 |
| 全局快捷键 Cmd+Shift+H | 通过 |
| 窗口位置持久化 | 通过 |

## 后续 TODO

- [ ] NSPanel 样式：用 `window-vibrancy` Tauri 插件替代 `msg_send!`
- [ ] Tray 图标：当前是黑块，需要替换为正确图标
