ix: 终端 term.open() 时序问题 — rows=5 / rows=17 根因修复

 Context

 HermesBox 多 Tab 场景下，终端行数错误（rows=5 或 rows=17），且所有 Tab 无法输入。

 根因：isActive effect 使用 useEffect（paint 后异步运行），在容器 layout 完成前调用 term.open()，导致 xterm.js
 在零尺寸容器上创建错误内部状态。ResizeObserver 本可纠正，但 isActive effect 先执行使 term.element 变为 truthy，导致
 observer 的 !term.element 守卫永远为 false。

 修改方案

 核心思路：将 isActive effect 从 useEffect 改为 useLayoutEffect（paint 前同步运行），确保 term.open() 在容器 layout
 完成后执行。同时移除 ResizeObserver 中的 requestAnimationFrame 包装，使其同步打开终端。

 修改文件：src/components/TerminalView.tsx

 Step 1 — 导入 useLayoutEffect

 // line 1: 添加 useLayoutEffect
 import { useRef, useState, useEffect, useLayoutEffect } from "preact/hooks";

 Step 2 — 修改 ResizeObserver 回调（line 163-174）

 移除 requestAnimationFrame 包装，同步执行 fitAddon.fit() 和 spawnPty()：

 const observer = new ResizeObserver((entries) => {
   const { width, height } = entries[0].contentRect;
   if (width > 0 && height > 0 && !term.element && activeRef.current) {
     term.open(container);
     try { fitAddon.fit(); } catch { /* ignore */ }
     spawnPty();
   }
 });

 Step 3 — 将 isActive effect 从 useEffect 改为 useLayoutEffect（line 220）

 // line 220: useEffect → useLayoutEffect
 useLayoutEffect(() => {
   activeRef.current = isActive;
   // ... 其余逻辑不变
 }, [isActive]);

 Step 4 — 确认修复后移除 debug console.log（line 166, 170, 229, 238）

 执行时序对比

 修复前（当前）

 Render → Mount effect (setup observer)
        → isActive effect (useEffect, paint后)
          → term.open(container) ← 容器 layout 可能未完成！
          → rows=5
        → Observer fires
          → !term.element = false → 跳过

 修复后

 Render → Mount effect (setup observer)
        → Observer fires (layout后, paint前)
          → term.open(container) ← 容器已完成 layout
          → fitAddon.fit() + spawnPty()
        → isActive effect (useLayoutEffect, paint前)
          → term.element 已存在 → 跳过 open
          → fitAddon.fit() (幂等) + spawnPty() (幂等)
        → Paint ← 终端已正确初始化

 场景时序分析

 ┌─────────────────────────────────┬────────────────────────────────────────┬─────────────────────────────────┬──────┐
 │              场景               │             observer 时机              │      useLayoutEffect 时机       │ 结果 │
 ├─────────────────────────────────┼────────────────────────────────────────┼─────────────────────────────────┼──────┤
 │ 新建 tab（parent 已 visible）   │ 首次 observe 立即触发 → open+fit+spawn │ term.element 已存在 → 跳过 open │ ✓    │
 ├─────────────────────────────────┼────────────────────────────────────────┼─────────────────────────────────┼──────┤
 │ 新建 tab（parent 从 none→flex） │ parent 变化时触发 → open+fit+spawn     │ term.element 已存在 → 跳过 open │ ✓    │
 ├─────────────────────────────────┼────────────────────────────────────────┼─────────────────────────────────┼──────┤
 │ Tab 切换（已 open）             │ 不触发（尺寸未变）                     │ fit+spawn (幂等)+flush+focus    │ ✓    │
 ├─────────────────────────────────┼────────────────────────────────────────┼─────────────────────────────────┼──────┤
 │ Tab 切换（未 open）             │ 不触发                                 │ open+fit+spawn+flush+focus      │ ✓    │
 └─────────────────────────────────┴────────────────────────────────────────┴─────────────────────────────────┴──────┘

 技术依据

 - Preact useLayoutEffect：DOM 变更后、paint 前同步运行，强制浏览器完成 layout（来源：useLayoutEffect.md line 50, 262, 39）
 - ResizeObserver：layout 后、paint 前触发；首次 observe 立即触发（来源：浏览器规范）
 - xterm.js open()：创建 DOM + CharSizeService.measure() + RenderService（来源：xterm.js 源码分析）
 - xterm.js resize()：_afterResize() → _charSizeService.measure() 可恢复零尺寸状态（来源：xterm.js 源码分析）
 - FitAddon fit()：proposeDimensions() 在 cell.width=0 || cell.height=0 时返回 undefined → 静默跳过（来源：addon-fit.js
 源码分析）

 验证步骤

 1. pnpm typecheck — 通过
 2. pnpm test — 全绿
 3. pnpm tauri dev — 手动测试：
   - 场景 1：打开 1 个 shell，确认 rows≈26，可输入
   - 场景 2：逐个打开 5 个 shell，每开一个输入命令
   - 场景 3：一次打开 5 个 shell，确认所有 tab 可输入
   - 场景 4：Hermes + 4 shells，确认所有 tab 可输入
 4. Console 日志确认：新 tab 应显示 observer opening: WxH，tab 切换应显示 isActive opening terminal

 关联文档

 - worklog/HANDOFF-2026-05-09-term-open-timing.md — 根因分析与修复方案
 - worklog/HANDOFF-2026-05-09-multitab-performance.md — P0/P2 修复清单
 - TEST/console_reconstructed_副本.md — 最新 console 日志