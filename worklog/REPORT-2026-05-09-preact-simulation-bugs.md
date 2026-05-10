# Preact 生命周期仿真测试报告 — 5 个 Bug 验证与修复方案

**日期**：2026-05-09
**分支**：fix/window-scroll-and-tab-shortcuts
**测试文件**：`TEST/preact-simulation.test.tsx`、`TEST/verify-conclusions.test.tsx`
**结果**：11/11 通过，409ms

---

## 背景

三轮独立测试（Round 1: xterm-timing-test, Round 2: xterm-stress-test, Round 3: vitest 集成测试）确认了 5 个 Preact 层面的 Bug。本轮使用 Mock 对象 + 仿真组件，在隔离环境下验证每个 Bug 的触发路径和修复方案。

---

## 仿真架构

```
MockTerminal          MockPty             SimulatedTerminalView
├─ open/write/focus   ├─ kill/write/resize  ├─ Effect 1: terminal + RO (useEffect [shell])
├─ onResize/onData    ├─ onData/onExit      ├─ Effect 2: isActive (useLayoutEffect [isActive])
├─ emit/dispose       ├─ simulateData/Exit  ├─ Effect 3: theme observer (useEffect [])
└─ listeners 记录     └─ alive/ready 状态   ├─ handleInput (useCallback [])
                                            └─ fixC2/fixC3/fixC4/fixC5 开关
```

- `EventLog`：带时间戳的事件序列记录器
- `MockTerminal`：模拟 xterm.js Terminal，write-after-dispose 抛异常
- `MockPty`：模拟 tauri-pty，支持 simulateData/simulateExit
- `SimulatedTerminalView`：镜像 TerminalView.tsx 的 5 个 effect 结构

---

## Bug 验证结果

### C2: 主题 Observer 过期引用

**严重级**：MEDIUM
**触发条件**：shell 变更 → terminal 重建 → 主题变化
**根因**：`useEffect(() => { ... }, [])` 闭包捕获初始 `termRef.current`，shell 变更后 observer 仍引用已 dispose 的旧 terminal

**仿真验证**：
```
BUG: old term disposed=true, new term id=c2-term
     → observer 使用已 dispose 的旧 terminal
FIX: observer 读 termRef.current（始终为当前 terminal）
```

**修复方案**：TerminalView.tsx line 264 的 Effect 3
```typescript
// BEFORE (bug)
useEffect(() => {
  const term = termRef.current;  // 闭包捕获，永不更新
  const observer = new MutationObserver(() => {
    applyTheme(term);  // stale!
  });
  ...
}, []);

// AFTER (fix)
useEffect(() => {
  const observer = new MutationObserver(() => {
    applyTheme(termRef.current);  // 每次回调读最新值
  });
  ...
}, []);
```

---

### C3: pendingWrites 内存泄漏

**严重级**：MEDIUM
**触发条件**：PTY 立即退出（从未触发 onData）+ 用户继续输入
**根因**：`onExit` 回调不清空 `pendingWrites`，唯一的清理路径在 `onData` 首次触发时

**仿真验证**：
```
BUG: PTY dead, input may leak to pendingWrites
     → 100 次输入全部堆积在 pendingWrites 中（~1.2KB）
FIX: onExit 中清空 pendingWrites + pendingData
```

**修复方案**：TerminalView.tsx line 138 的 `pty.onExit`
```typescript
// AFTER (fix)
pty.onExit(({ exitCode }) => {
  // ... existing code ...
  pendingWritesRef.current = [];  // 新增
  pendingDataRef.current = { chunks: [], bytes: 0 };  // 新增
});
```

---

### C4: PTY kill fire-and-forget 竞态

**严重级**：LOW
**触发条件**：快速 shell 变更（<50ms 内连续两次）
**根因**：`pty.kill()` 通过 IPC 异步执行，cleanup 返回时 PTY 进程可能仍 alive

**仿真验证**：
```
BUG: kill() returns immediately, PTY still alive=true
FIX: cleanup 同步标记 alive=false
```

**修复方案**：TerminalView.tsx cleanup 函数
```typescript
// AFTER (fix)
return () => {
  if (ptyRef.current) {
    ptyRef.current.alive = false;  // 新增：同步标记
    ptyRef.current.kill();
  }
  // ... rest of cleanup
};
```

---

### C5: onResize 无 ready 守卫

**严重级**：LOW
**触发条件**：fitAddon.fit() 在 PTY 首次 onData 之前触发
**根因**：`term.onResize` 回调直接调用 `pty.resize()`，无 `ptyReady` 守卫（而 `onData` 有）

**仿真验证**：
```
BUG: resize fired before PTY ready → pty.resize() 被调用
FIX: ptyReadyRef.current 守卫拦截
```

**修复方案**：TerminalView.tsx line 112 的 onResize 回调
```typescript
// AFTER (fix)
term.onResize(({ cols, rows }) => {
  if (!ptyReadyRef.current) return;  // 新增守卫
  pty.resize(cols, rows);
});
```

---

## 极限场景测试

| 场景 | 结果 | 结论 |
|------|------|------|
| 10 次快速 isActive 切换 | 1 terminal + 1 PTY | 无泄漏，shell 未变不重建 |
| 5 次快速 shell 变更 | 5 PTY，旧的全部 alive=false | cleanup 正常工作 |

---

## 修复清单

| # | Bug | 文件 | 行 | 改动量 | 优先级 |
|---|-----|------|----|--------|--------|
| 1 | C2 主题 observer 过期引用 | TerminalView.tsx | ~264 | 1 行 | MEDIUM |
| 2 | C3 pendingWrites 泄漏 | TerminalView.tsx | ~138 | 2 行 | MEDIUM |
| 3 | C4 PTY kill 竞态 | TerminalView.tsx | ~172 | 1 行 | LOW |
| 4 | C5 onResize 无守卫 | TerminalView.tsx | ~112 | 1 行 | LOW |

**总改动量**：~5 行代码

---

## 测试文件清单

| 文件 | 测试数 | 用途 |
|------|--------|------|
| `TEST/preact-simulation.test.tsx` | 11 | 仿真 + 极限场景 |
| `TEST/verify-conclusions.test.tsx` | 6 | 5 个 Bug 结论验证 |
| `TEST/xterm-api-boundary.test.ts` | 15 | xterm.js API 边界 |
| `TEST/preact-lifecycle-timing.test.tsx` | 8 | Preact hooks 时序 |
| `TEST/browser-api-timing.test.ts` | 6 | 浏览器 API 时序 |
| **合计** | **46** | |

---

## 后续步骤

1. 将 4 个修复应用到 TerminalView.tsx（~5 行）
2. `pnpm test` + `pnpm typecheck` 验证
3. 手动测试：shell 变更后切换主题、快速 Tab 切换
4. commit + worklog



 ┌─────┬───────────────────────────────────────────────┐
  │ Bug │                实际修的是什么                 │
  ├─────┼───────────────────────────────────────────────┤
  │ C2  │ shell 变更后切换主题时 observer 用旧 terminal │
  ├─────┼───────────────────────────────────────────────┤
  │ C3  │ PTY 从未启动就退出时的内存泄漏                │
  ├─────┼───────────────────────────────────────────────┤
  │ C4  │ 50ms 内连续两次 shell 变更的竞态              │
  ├─────┼───────────────────────────────────────────────┤
  │ C5  │ PTY 首次 onData 之前触发 resize               │
  └─────┴───────────────────────────────────────────────┘