# FIX — 多 Tab rows=5 问题修复

**日期**：2026-05-09
**分支**：fix/window-scroll-and-tab-shortcuts
**状态**：完成

## 症状

快速创建 5 个 Tab 时，第 5 个 Tab 只有光标闪烁，所有 Tab 无法输入。Debug 日志显示：

- 初始 PTY spawn: cols=105 rows=33（正常）
- 切换 Tab 后: cols=105 rows=5（异常）

## 根因分析

### 已排除

- **CSS 布局问题**：CSS 模块已正确应用 `position: absolute; inset: 0`，非活跃终端不参与 flex 布局（Vite dev server 确认 class `_terminal_45wkm_1` 生效）
- **WebGL context 泄漏**：项目未加载 WebGL addon，默认 Canvas 渲染器

### 实际根因（双因素）

**因素 A：`fitAddon.fit()` 仅在首次 PTY spawn 时调用**

```typescript
// 旧代码
if (!ptyRef.current) {
  fitAddon.fit();  // 只在首次 spawn 时 fit
  spawn(...);
}
```

当 Tab 切换回来时，终端容器可能已 resize（窗口大小变化、TabBar 高度变化等），但不会重新 fit。PTY 保持旧尺寸。

**因素 B：`term.onResize` 去重逻辑阻止 PTY 同步**

```typescript
// 旧代码
let lastResize = null;
term.onResize((e) => {
  if (lastResize && e.cols === lastResize.cols && e.rows === lastResize.rows) return;
  lastResize = { ... };
  pty.resize(e.cols, e.rows);
});
```

如果 PTY 以错误尺寸 spawn，后续 ResizeObserver 触发的正确 resize 可能被去重逻辑跳过（`fitAddon.fit()` 内部也会判断尺寸是否变化再调用 `term.resize()`）。

## 修复内容

### TerminalView.tsx

1. **`fitAddon.fit()` 移到 PTY spawn 逻辑外面** — 每次 Tab 激活都重新 fit，确保终端尺寸正确
2. **移除 `term.onResize` 去重逻辑** — PTY 总是同步终端尺寸，ResizeObserver 的 100ms debounce 已提供节流
3. **移除 `renderService.clear()`/`refreshRows()` 调用** — 依赖 xterm.js 内置 IntersectionObserver 自动暂停/恢复（P0-3 修复）
4. **移除 debug console.log** — 清理调试代码

### App.tsx

- `MAX_TABS = 5` — 限制 Tab 数量防止资源耗尽（P2-1 修复，已有）

## 验证

- `pnpm typecheck`：通过
- `pnpm test`：117 tests 全绿
- 需要手动验证：`pnpm tauri dev`，按 TEST/Tab压力测试报告.md 重测

## 决策记录

**为什么不用 `display: none`**：`display: none` 元素面积为 0，IntersectionObserver 不触发，会破坏 xterm.js 自动暂停机制。

**为什么移除去重逻辑**：`pty.resize()` 是幂等操作（发送 SIGWINCH 信号），调用开销低。ResizeObserver 的 100ms debounce 已提供足够的节流。去重逻辑的收益不值得其引入的 PTY 不同步风险。
