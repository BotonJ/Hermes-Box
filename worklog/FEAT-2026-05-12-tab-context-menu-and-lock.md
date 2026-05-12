# FEAT-2026-05-12 Tab 右键菜单、锁定、重命名、颜色

**分支**: `feat/launch-in-default-terminal`

---

## Summary

为 TabBar 添加自定义右键菜单，支持标签锁定、重命名、颜色标记、复制标题、关闭标签/关闭其他标签。同时修复了 terminal.rs 中的 shell 注入漏洞和 exec 语义错误。

---

## Commits

| Hash | Message |
|------|---------|
| (本次) | fix(terminal): shell injection + exec semantics |
| (本次) | feat(tab): context menu with lock, rename, color |

---

## Changes

### 1. Shell 注入修复（terminal.rs）

- 新增 `shell_escape()` 函数：单引号包裹 + 内部单引号转义
- `hermes$(whoami)` → `'hermes$(whoami)'`，`$()` 在单引号内为字面量
- 新增 5 个单元测试覆盖注入场景

### 2. Exec 语义修复（terminal.rs）

- 移除命令前的 `exec`，改为直接运行
- 原脚本 `exec "hermes"` 替换进程后 `exec $SHELL` 永不执行，终端窗口直接关闭
- 修复后：CLI 退出 → `exec $SHELL` → 窗口保持打开

### 3. Tab 右键菜单（新组件）

- `ContextMenu.tsx` + `ContextMenu.module.css`
- 拦截 `contextmenu` 事件，完全替换系统菜单（禁用搜索/演讲/服务/Inspect Element）
- 菜单项：锁定/解锁、重命名、颜色选择（8 色）、复制标题、关闭、关闭其他
- 自动 clamp 到视口边界

### 4. Tab 锁定

- `TabInfo.locked?: boolean`，持久化到 localStorage
- 锁定 tab：X 按钮隐藏、🔒 图标显示、关闭标签菜单项置灰
- 关闭其他标签跳过锁定 tab
- 进程退出不受锁定影响（handleTabExit 绕过锁定检查）

### 5. Tab 重命名

- 右键 → 重命名 → inline 输入框替换标题
- Enter 确认、Escape 取消、失焦自动保存
- `TabInfo.customTitle?: string`，持久化
- 显示优先级：`customTitle ?? title`

### 6. Tab 颜色

- 8 色预设（红/橙/黄/绿/蓝/紫/粉/灰）
- 选中后 tab 顶部 2px 彩色边条
- 可清除（恢复默认）
- `TabInfo.color?: string`，持久化

---

## Files Changed

```
src-tauri/src/terminal.rs           (+47 lines: shell_escape + tests)
src/components/ContextMenu.tsx       (new, 112 lines)
src/components/ContextMenu.module.css (new, 97 lines)
src/components/TabBar.tsx            (rewrite, 160 lines)
src/components/TabBar.module.css     (+18 lines: lockIcon, renameInput)
src/components/TabBar.test.tsx       (+5 lines: new props)
src/App.tsx                          (+62 lines: handlers + save/restore)
src/lib/tab-storage.ts               (+3 lines: new fields)
src/lib/locales/zh.json              (+10 lines: contextMenu keys)
src/lib/locales/en.json              (+10 lines: contextMenu keys)
```

---

## Verification

- `pnpm typecheck` — pass
- `pnpm test` — 159 tests pass
- `cargo test --lib terminal` — 5 tests pass
- `cargo check` — compiles (warnings from window.rs only)
