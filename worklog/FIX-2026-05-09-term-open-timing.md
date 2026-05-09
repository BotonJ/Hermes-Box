# FIX — 终端 term.open() 时序问题修复

**日期**：2026-05-09
**状态**：完成

## 症状

HermesBox 多 Tab 场景下，终端行数错误（rows=5 或 rows=17），所有 Tab 无法输入。

## 根因

`isActive` effect 使用 `useEffect`（paint 后异步运行），在容器 layout 完成前调用 `term.open()`，导致 xterm.js
在零尺寸容器上创建错误内部状态。ResizeObserver 本可纠正，但 `isActive` effect 先执行使 `term.element` 变为
truthy，导致 observer 的 `!term.element` 守卫永远为 false。

## 变更

### src/components/TerminalView.tsx

1. **导入 useLayoutEffect** — line 1
2. **ResizeObserver 回调同步化** — 移除 `requestAnimationFrame` 包装，`term.open()` + `fitAddon.fit()` + `spawnPty()`
   同步执行
3. **isActive effect 改为 useLayoutEffect** — 确保 DOM 变更后、paint 前同步运行
4. **移除 debug console.log** — 4 处 `[DEBUG-TV]` 日志

### 新增测试

- `src/components/TerminalView.test.tsx` — 4 个测试验证时序行为
- `src/__mocks__/tauri-pty.ts` — 测试环境 Tauri PTY mock
- `vite.config.ts` — 添加 `tauri-pty` alias 解决 jsdom 模块解析

## 验证

- `pnpm typecheck`：通过
- `pnpm test`：121 passed（含 4 个新增 TerminalView 测试）

## 修复后时序

```
Render → Mount effect (setup observer)
        → Observer fires (layout后, paint前)
          → term.open(container) ← 容器已完成 layout
          → fitAddon.fit() + spawnPty()
        → isActive effect (useLayoutEffect, paint前)
          → term.element 已存在 → 跳过 open
          → fitAddon.fit() (幂等) + spawnPty() (幂等)
        → Paint ← 终端已正确初始化
```
