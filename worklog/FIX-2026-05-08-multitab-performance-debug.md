# 多 Tab 性能诊断与优化

**日期**：2026-05-08
**状态**：完成
**分支**：fix/window-scroll-and-tab-shortcuts

---

## 症状

打开 5~6 个 Tab 后：
- 输入文字明显卡顿，CLI 不再回复
- 继续打开 Tab 持续恶化
- Selector 界面滚动时上方出现巨大黑色色块

## 根因分析

### 1. 非活跃 Tab 全量处理 PTY 数据

所有 Tab（包括 `visibility: hidden`）仍然执行 `term.write(bytes)`，触发 xterm 完整的解析→缓冲→渲染管线。5 个 Tab 同时接收数据时，主线程被 xterm 解析占满。

```
修复前：PTY → trackBytes → term.write(parse+render) → clear() 丢弃
修复后：PTY → trackBytes → buffer（跳过 xterm）→ 切换时 flush → refreshRows
```

### 2. Debug 指标 API 路径错误

- `bufferLines` 始终为 0：使用了 `core._buffer.lines.length`（不存在），正确路径为 `term.buffer.active.length`
- `renderActive` 始终为 true：渲染暂停状态未同步到指标系统

### 3. 布局问题

Selector 和 Terminal 容器的定位方式导致滚动时黑色色块。改用 v1 的 flex column 模式（`position: relative; flex: 1; min-height: 0`）。

---

## 变更

### TerminalView.tsx

**新增 ref**：
- `activeRef` — 跟踪 `isActive` 状态，在 PTY 回调闭包中读取
- `pendingDataRef` — 缓冲非活跃 Tab 的 PTY 数据（上限 512 KB，FIFO 丢弃）
- `renderPausedRef` — 跟踪渲染器暂停状态

**PTY onData 逻辑**：
```typescript
if (activeRef.current) {
  term.write(bytes);
} else {
  buf.chunks.push(bytes);
  buf.bytes += bytes.length;
  while (buf.bytes > MAX_PENDING && buf.chunks.length > 1) {
    buf.bytes -= buf.chunks.shift()!.length;
  }
}
```

**isActive 切换效果**：
- 激活时：flush 缓冲数据 → refreshRows
- 非活跃时：清空渲染器

**指标修复**：
- `bufferLines`: `core._buffer.lines.length` → `term.buffer.active.length`
- `renderActive`: 通过 `renderPausedRef` 同步实际状态

### debug-metrics.ts（新建）

全局状态 + 监听器模式，提供：
- `TabMetrics` 接口（id, title, isActive, bytesIn, bytesPerSec, bufferLines, cols, rows, renderActive）
- `updateTabMetrics()` / `removeTabMetrics()` — TerminalView 调用
- `useDebugMetrics()` — DebugOverlay 使用
- `createByteRateTracker()` — 滑动窗口计算 bytes/sec

### DebugOverlay.tsx（新建）

- Ctrl+Shift+D 切换显示/隐藏，关闭时自动导出 JSON 到剪贴板
- Ctrl+Shift+E 手动导出
- 500ms 采样周期，显示每个 Tab 的实时指标
- 表头：Tab / Active / Bytes/s / Total / Buffer / Size / Render

### App.tsx

- 终端容器条件从 `view === "terminal" && showTabs` 改为 `showTabs`（保持 PTY 存活）
- 布局从 absolute overlay 改为 v1 的 flex column 模式
- 添加 DebugOverlay 组件

---

## 验证

- `pnpm typecheck`：通过
- `pnpm test`：109 passed（13 文件）
- `cargo test`：0 passed, 0 failed
- DebugOverlay 采集 460 样本确认指标正确

---

## 待验证

- [ ] 5~6 Tab 场景下输入卡顿是否消除
- [ ] Selector 滚动黑色色块是否消失
- [ ] bufferLines 数值是否正确显示
- [ ] renderActive 是否准确反映非活跃 Tab 状态
