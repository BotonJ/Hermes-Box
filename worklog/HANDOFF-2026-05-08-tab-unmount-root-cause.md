# HANDOFF — Bug 2/3 深度诊断交接

**日期**：2026-05-08
**状态**：待修复
**HEAD**：`3ecf1ea` + 工作区未提交改动

## 已确认的根因

### 核心问题：Preact Signals 导致所有 TerminalView 在每次重渲染时 unmount/remount

**每次添加新 tab 时，`addTab` 修改 `tabs.value` signal → `App` 组件重渲染 → 所有 `TerminalView` 被 UNMOUNT → PTY 被 CLEANUP kill → 所有组件重新 MOUNT → PTY 重新 spawn。**

PTY 不是自己退出的，是被 cleanup 函数 kill 的（日志中 `[PTY] CLEANUP (kill)` 确认）。

### 日志证据

```
tab 1: MOUNT shell → spawned zsh → UNMOUNT → CLEANUP kill → MOUNT shell (respan!)
tab 2: UNMOUNT shell,hermes → CLEANUP both → MOUNT both → spawn both
tab 3: UNMOUNT 3个 → CLEANUP 3个 → MOUNT 3个 → spawn 3个
tab 4: UNMOUNT 3个 → CLEANUP 3个 → MOUNT 4个 → spawn 4个
```

每次新增 tab = 全部 N 个 tab 重建 = N 次 PTY kill + N 次 PTY spawn。

### 尝试过的修复

| 方案 | 结果 |
|------|------|
| `visibility: hidden` + `position: absolute` | 未阻止 unmount |
| `<For each={tabs}>` from `@preact/signals/utils` | 未阻止 unmount |
| 提取 `TerminalList` 子组件 | 未阻止 unmount |
| `useMemo` 缓存 VNode | 未阻止 unmount |

### 为什么 `<For>` 没有生效

`<For>` 组件需要 `each` prop 接收 signal 本身。但 `App` 组件还读取了 `view.value`、`activeTabId.value` 等其他 signal。当 `addTab` 执行时，`tabs.value`、`activeTabId.value`、`view.value` **三个 signal 同时变化**，触发 `App` 多次重渲染。

重渲染时，`showTerminals` 条件表达式 `currentView === "terminal" && tabs.value.length > 0` 的求值结果虽然为 true，但 **Preact 将其所在的条件分支视为新的 children**，导致 `<For>` 组件本身被 unmount/remount，进而级联销毁所有子 TerminalView。

### 根因总结

**Preact Signals 的组件重渲染粒度是组件级别的。`App` 组件读取了 3 个 signal，任何一个变化都触发整个 App 重渲染。条件渲染 `{showTerminals && <For ...>}` 在每次重渲染时产生新的 VNode 树，Preact 无法识别为"同一个"组件实例，导致 `<For>` 被销毁重建。**

## 修复方向

### 方案 A：消除 App 组件对 tabs/activeTabId signal 的直接读取

将 `App` 拆分为只读取 `view` signal 的外壳 + 独立的 `TerminalContainer` 组件（只读取 `tabs` signal）。这样 `activeTabId` 变化不会触发终端列表重建。

```tsx
// App 只读 view signal
function App() {
  const currentView = view.value;
  return (
    <div>
      {currentView !== "welcome" && <Header />}  {/* 读 tabs + activeTabId */}
      {currentView === "terminal" && <TerminalContainer />}  {/* 读 tabs */}
      {currentView === "welcome" && <Welcome />}
    </div>
  );
}

// TerminalContainer 只读 tabs signal
function TerminalContainer() {
  return tabs.value.map(tab => (
    <TerminalView key={tab.id} tab={tab} isActive={tab.id === activeTabId.value} />
  ));
}
```

但这个方案仍然有问题：`TerminalContainer` 读取了 `tabs.value` 和 `activeTabId.value`，`addTab` 时两者同时变化，仍然可能导致双重渲染。

### 方案 B：绕过 Preact 的 VNode diff，用 DOM 直接管理终端容器

不用 Preact 管理 TerminalView 的生命周期。在 `App` 中创建一个固定的 `<div id="terminals">`，用 `useEffect` 手动管理 Terminal 实例的创建/销毁。信号变化时只做增量操作（添加/移除），不做全量重建。

### 方案 C：使用 React-like 的状态管理替代全局 signal

用 `useState` + Context 管理 tabs 列表，用 Preact 的标准 diff 算法保证 `key` 稳定性。Signal 只用于非组件状态（如 activeTabId）。

### 方案 D（推荐）：完全脱离 Preact 管理 Terminal 生命周期

Terminal 本身是命令式的（`new Terminal()` + `term.open()`），不适合声明式管理。改为：

1. `App` 只渲染一个空的 `<div ref={terminalContainerRef}>`
2. `useEffect` 监听 `tabs.value` 变化，做增量 diff
3. 新 tab → 创建 Terminal + PTY，append 到 DOM
4. 关闭 tab → kill PTY + dispose Terminal，remove DOM
5. 切换 tab → 只改 `visibility`，不触发生命周期

这彻底绕开了 Preact Signals 的重渲染问题。

## 当前测试状态

| 检查 | 结果 |
|------|------|
| `pnpm test` | 93 passed |
| `cargo test` | 27 passed |
| `cargo clippy` | clean |
| 实机：3 tab 切换 | session 保持 ✓ |
| 实机：4+ tab | 所有 tab 重建，session 丢失 ✗ |
| 实机：卡顿/黑屏 | 未改善（因 N 次重建） |

## 调试日志位置

当前代码包含调试 `console.log`：
- `src/components/TerminalView.tsx:18` — MOUNT
- `src/components/TerminalView.tsx:66` — UNMOUNT
- `src/lib/pty-attach.ts:9` — spawned
- `src/lib/pty-attach.ts:37` — EXIT
- `src/lib/pty-attach.ts:68` — CLEANUP

修复完成后需移除。



在于 Terminal 实例不该由 Preact 的声明式 VNode diff 管理。VS Code 也是把 xterm.js
  实例存在一个独立的 map 里，React 树只渲染空容器，Terminal 的创建/销毁由命令式代码控制。