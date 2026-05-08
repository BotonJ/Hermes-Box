# 多 Tab 性能优化 — 延迟 PTY Spawn + 布局修复

**日期**：2026-05-08
**状态**：完成
**分支**：fix/window-scroll-and-tab-shortcuts

---

## 症状

打开 5~6 个 Tab 后：
- 输入文字明显卡顿，CLI 不再回复
- 继续打开 Tab 持续恶化至 UI 完全冻结
- Selector 界面滚动时上方出现巨大黑色色块

## 根因分析

### 1. 所有 Tab 立即 spawn PTY 进程（核心问题）

每个 Tab mount 时立即 `spawn(shell)` 创建 PTY 进程。7 个 Tab = 7 个 xterm 实例 + 7 个 PTY 进程同时运行，即使大部分 Tab 的 bytesIn=0（无输出）。

Overlay 数据证实：7 Tab、bytesIn 全为 0 时 UI 已冻结。问题不是渲染吞吐量，是**同时运行的进程数**。

### 2. Terminal 容器与 Selector 布局冲突

Terminal 容器和 Selector 容器都使用 `flex: 1`，当 `view === "selector"` 时 terminal 容器仍占据空间，其黑色背景在滚动时露出。

### 3. 非活跃 Tab 全量处理 PTY 数据

所有 Tab（包括 `visibility: hidden`）仍然执行 `term.write(bytes)`，触发 xterm 完整的解析→缓冲→渲染管线。

---

## 变更

### TerminalView.tsx

**PTY 延迟 spawn**：
- mount 时只创建 xterm 实例，不 spawn PTY
- PTY 在首次 `isActive=true` 时才 spawn
- 后续 isActive 切换：暂停/恢复渲染器 + flush 缓冲数据

**渲染器暂停**：
- 非活跃 Tab 调用 `renderService.clear()` 停止渲染
- 激活时 `renderService.refreshRows()` 恢复 + flush 缓冲

**缓冲区管理**：
- 非活跃 Tab 的 PTY 数据存入 `pendingDataRef`（上限 512KB，FIFO 丢弃）
- 激活时一次性 flush 到 xterm

### App.tsx

**布局修复**：
- Terminal 容器在 `view !== "terminal"` 时设为 `display: none`
- Selector 获得全部 flex 空间，黑色色块消除

**DebugOverlay 集成**：
- 添加 `<DebugOverlay />` 组件

### debug-metrics.ts（新建）

全局状态 + 监听器模式：
- `TabMetrics` 接口（id, title, isActive, bytesIn, bytesPerSec, bufferLines, cols, rows, renderActive）
- `updateTabMetrics()` / `removeTabMetrics()` — TerminalView 调用
- `useDebugMetrics()` — DebugOverlay 使用
- `createByteRateTracker()` — 滑动窗口计算 bytes/sec

### DebugOverlay.tsx（新建）

- Ctrl+Shift+D 切换显示/隐藏，关闭时自动导出 JSON 到剪贴板
- Ctrl+Shift+E 手动导出
- 500ms 采样周期，显示每个 Tab 的实时指标

---

## 验证

- `pnpm typecheck`：通过
- `pnpm test`：109 passed（13 文件）

### Overlay 数据对比

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 7 Tab + bytesIn=0 | UI 冻结 | 正常响应 |
| 5 Tab + find / 峰值 37KB/s | 卡死 | 可操作 |
| Selector 滚动 | 黑色色块 | 正常 |

---

## 待验证

- [ ] 边界测试：10+ Tab、长时间运行、快速切换
- [ ] bufferLines 指标：bufferLines - rows = 实际 scrollback 行数（显示优化）
- [ ] WebGL addon：已安装但未启用，Tauri WebKit 兼容性待测
