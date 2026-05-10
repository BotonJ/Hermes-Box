# FEAT: Phase 6 — Rust Backend (approval, window, tray)

**日期**: 2026-05-10
**分支**: fix/window-scroll-and-tab-shortcuts
**状态**: 完成

## 概述

从 v1 移植三个 Rust 后端模块到 v2，实现审批流、窗口管理和系统托盘功能。

## 变更内容

### 新增依赖 (`Cargo.toml`)

- `serde_yaml = "0.9"` — Hermes YAML 配置生成
- `notify = "7"` — 审批文件监控
- `log = "0.4"` — 结构化日志
- `objc = "0.2"` (macOS) — NSPanel 样式
- `tauri` features: `tray-icon`

### 新增模块

#### `approval.rs` (24 tests)
- `ApprovalRequest` 结构体：id, tool_name, command, raw_json, source
- `parse_approval_request()` — 解析 Claude Code / Hermes 审批 JSON
- `scan_pending_dir()` — 扫描 pending 目录
- `write_result_file()` — 原子写入审批结果
- `cleanup_stale_files()` — 清理过期文件
- `start_watcher()` — notify 文件监控 + 自动弹窗
- `generate_approval_config()` — 生成 Claude/Hermes hook 配置
- 安全：路径遍历防护、action 白名单

#### `window.rs` (9 tests)
- `WindowPosition` 结构体 + serde
- `save_position_to_disk()` — 原子写入（tmp + fsync + rename）
- `load_position_from_disk()` — 读取 + 边界校验
- `apply_ns_panel_style()` — macOS NSPanel（透明标题栏 + 毛玻璃）
- `toggle_window_visibility()` — 显示/隐藏 + 位置持久化
- `show_and_focus_main_window()` — 审批流自动弹窗

#### `tray.rs` (0 tests, 运行时依赖)
- 系统托盘菜单：Show/Hide、Settings、Quit
- 左键点击切换窗口可见性
- 菜单项标签动态更新

### 修改文件

- `lib.rs` — 注册 3 个新模块 + 4 个 approval 命令 + setup 逻辑
  - 单实例锁 + --minimized 支持
  - 全局快捷键 Cmd+Shift+H
  - 关闭窗口 → 隐藏（防退出）
  - NSPanel 样式延迟应用（100ms）
  - 窗口位置恢复

## 测试结果

```
Rust:      37 tests passed (24 approval + 9 window + 4 pty)
Frontend: 127 tests passed
Total:    164 tests
```

## 关键决策

1. **v2 架构适配**：approval 使用 `app.emit()` 而非直接调用 window 模块，保持松耦合
2. **tray-icon feature**：Tauri v2 需要显式启用 `tray-icon` feature
3. **NSPanel 延迟**：100ms 延迟避免 tao 0.34.x ObjC 异常
4. **objc 依赖**：仅 macOS 编译（`target.'cfg(target_os = "macos")'.dependencies`）

## 下一步

- Phase 7: 全栈验证（dev mode 测试所有功能）
- Phase 5 回顾：如不满意可回退改进
