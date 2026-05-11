# FIX: PTY Resize 同尺寸去重 + fontSize debounce

**日期**：2026-05-11
**分支**：v2-rebuild
**类型**：Bug Fix（P1 — resize 退化是用户体验核心问题）
**前置文档**：`worklog/RESIZE-FIX-PLAN-2026-05-11.md`

---

## 问题

窗口 resize 时终端内容闪烁/多行 prompt，严重程度超过原生终端（iTerm2/Ghostty）。

**根因**：`131e6df`（Channel-based PTY 重写）时丢失了 `lastResize` 同尺寸去重 guard。原始 `bcf9a80` 中有：

```typescript
// bcf9a80 — 有去重
if (lastResize && e.cols === lastResize.cols && e.rows === lastResize.rows) {
  return;
}
```

重写后变为直接调用 `pty.resize()`，每次 onResize 都触发 IPC，竞态被放大。

**次要问题**：`fontSize` useEffect 直接调用 `fitAddon.fit()`（无 debounce），字体缩放时放大竞态。

---

## 修复（TDD 流程）

### 修改文件

| 文件 | 修改 |
|------|------|
| `src/lib/pty.ts` | `resize()` 返回 `Promise<void>`，不再 fire-and-forget |
| `src/lib/use-terminal-fit.ts` | `scheduleFit` 改为 `useCallback`，导出 `{ scheduleFit }` |
| `src/components/TerminalView.tsx` | 添加 `lastResizeRef`，onResize 恢复同尺寸 guard，fontSize effect 用 `scheduleFit` |
| `src/components/TerminalView.test.tsx` | 3 个新测试（同尺寸去重、不同尺寸正常、混合去重）；MockPty.onData 同步触发 ptyReady；MockPty.resize 返回 Promise |
| `src/components/TerminalView.stress-integration.test.tsx` | 适配 `useTerminalFit` 新返回值 + resize 返回 Promise |

### TDD 验证

**RED 阶段**（修复前，测试失败）：
- `same-size onResize fires pty.resize only once`: expected 1 call, got **2** — 无 guard，重复尺寸仍触发 resize
- `mix of same and different sizes dedupes correctly`: expected 3 calls, got **5** — 无去重，所有调用都触发
- `different sizes each trigger pty.resize`: PASS — 不同尺寸每次都触发（正确行为不受影响）

**GREEN 阶段**（修复后，全部通过）：
- 17 test files, **133 tests passed**
- `pnpm typecheck` 通过

---

## 技术细节

### pty.ts — resize() 返回 Promise

```typescript
// BEFORE: fire-and-forget，错误被 .catch 吞掉
resize(cols: number, rows: number) {
  invoke("pty_resize", { sessionId, cols, rows }).catch(...)
}

// AFTER: 返回 Promise，调用方自行处理
resize(cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { sessionId, cols, rows });
}
```

### TerminalView.tsx — lastResize guard

```typescript
// 新增 ref
const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);

// spawnPty 中初始化
lastResizeRef.current = { cols: term.cols, rows: term.rows };

// onResize 回调恢复去重
term.onResize((e) => {
  if (!ptyReady) return;
  if (lastResizeRef.current &&
      e.cols === lastResizeRef.current.cols &&
      e.rows === lastResizeRef.current.rows) {
    return;  // 同尺寸跳过
  }
  lastResizeRef.current = { cols: e.cols, rows: e.rows };
  pty.resize(e.cols, e.rows).catch(() => {});
});

// cleanup 重置
lastResizeRef.current = null;
```

### use-terminal-fit.ts — 导出 scheduleFit

```typescript
// scheduleFit 从裸函数改为 useCallback
const scheduleFit = useCallback(() => { ... }, [fitAddonRef]);

// 返回给调用方
return { scheduleFit };
```

### TerminalView.tsx — fontSize effect

```typescript
// BEFORE: 直接调用 fit()，无 debounce
fitRef.current.fit();

// AFTER: 通过 scheduleFit debounce
const { scheduleFit } = useTerminalFit({ containerRef, fitAddonRef: fitRef });
// ...
scheduleFit();
```

---

## 未做的事

| 项目 | 原因 |
|------|------|
| PTY-first 顺序 | 需绕过 fitAddon.fit() 自己算尺寸，改动量大；V1 从未成功实现；lastResize guard 已解决主因 |
| isActive guard | inactive tab 不渲染，resize 行为和活跃状态无关 |
| Rust 端修改 | `pty.rs` 当前实现正确，无需修改 |

---

## 测试命令

```bash
pnpm test          # 17 files, 133 tests passed
pnpm typecheck     # 通过
```

## 手动验证（待执行）

```bash
pnpm tauri dev
# - 拖动窗口边缘 resize，观察 prompt 多行重复是否明显减少
# - Ctrl+/- 调整字号，确认 resize 平滑
# - 多 tab 场景 resize
```
