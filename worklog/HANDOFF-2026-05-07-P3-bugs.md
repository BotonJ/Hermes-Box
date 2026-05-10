# HANDOFF — P3 实机测试 Bug 记录

**日期**：2026-05-07
**状态**：待修复
**来源**：实机测试（commit `3ecf1ea` 之后）

---

## Bug 1: Hermes 标签界面被限制在左侧窄条

**严重性**：HIGH
**复现步骤**：

1. 打开 Shell 标签，随意输入命令
2. 打开 Hermes 和 Claude Code 标签
3. 观察 Hermes 标签的界面

**表现**：Hermes 的界面被限制在左侧的窄条中，不是全宽显示。

**历史**：与 v1（hermes-box）最初遇到的问题相同。v1 曾经修复过此问题。

**根因（已确认）**：

`display: contents` 移除了 `.tabPanel` 的整个 box。`.terminal` 的 `height: 100%` 无法通过断裂的布局链解析，在某些 Chromium 版本中退化为内容高度。

CSS 盒模型链断裂：
```
.content (flex:1, 有高度)
  .tabPanel (display:contents → 无 box!)  ← 断裂点
    .terminal (height:100% → 解析失败 → 内容高度)
```

**关键文件**：`src/App.tsx:78`（`display: contents`）、`src/App.module.css`（`.tabPanel`）

---

## Bug 2: 多标签后所有终端黑屏

**严重性**：CRITICAL
**复现步骤**：

1. 打开 Shell 标签
2. 打开 Hermes 标签
3. 打开 Claude Code 标签
4. 继续打开更多标签
5. 观察所有终端

**表现**：所有标签的终端界面消失，变成黑屏。只剩空的标签页。

**根因（已确认）**：

PTY 以 `cols: 0, rows: 0` 启动。`display: none` 的容器尺寸为 0，初始 `fitAddon.fit()` 失败被 catch 静默吞掉，PTY 随后以零尺寸 spawn。Shell 进程在零尺寸终端中运行，切回时重新 fit 也无法恢复。

因果链：
```
新标签创建 → display:none → 容器尺寸 0×0
  → fitAddon.fit() 失败（catch 静默）
  → spawn(shell, args, { cols: 0, rows: 0 })
  → shell 在零尺寸 PTY 中运行
  → 切换到该标签 → re-fit 成功但 shell 不会重绘
  → 黑屏
```

附加因素：浏览器限制 WebGL context 约 8-16 个，多个隐藏终端各持有一个 context，可能触发限制。

**关键文件**：`src/components/TerminalView.tsx:42-49`（fit 失败静默）、`src/components/TerminalView.tsx:58-59`（cols/rows 为 0）

---

## 两个 Bug 的关系

共同根因：**`display: contents` / `display: none` 策略对 xterm.js 不兼容**。

- Bug 1：`display: contents` 移除 box → 尺寸解析失败 → 窄条
- Bug 2：`display: none` 零尺寸 → PTY 以 0×0 启动 → 黑屏

两者都是因为当前 CSS 策略破坏了 xterm.js 依赖的容器尺寸。

---

## v1 对比（已确认可用方案）

v1 使用完全不同的策略，没有这两个 bug：

| 维度 | v1 | v2（当前） |
|------|-----|-----------|
| 渲染 | 所有 tab 绝对定位堆叠 | `display: contents/none` 切换 |
| 隐藏方式 | `visibility: hidden` + `pointer-events: none` | `display: none` |
| 容器定位 | `position: absolute; top/left/right/bottom: 0` | `width/height: 100%` + flex |
| 尺寸保持 | 隐藏元素保留布局尺寸 | 隐藏元素尺寸为 0 |
| fit 策略 | ResizeObserver + 100ms debounce + minCols/minRows 守卫 | 单次 requestAnimationFrame |
| PTY spawn 时机 | 容器有尺寸后才 spawn | mount 立即 spawn（可能零尺寸） |

---

## Bug 3: 多标签资源耗尽（WebGL context 限制）

**严重性**：CRITICAL
**状态**：已确认根因，待修复
**来源**：实机测试（absolute stacking 修复后）

**复现步骤**：

1. 依次打开 Shell、Hermes、Claude Code 等标签
2. 打开第 5 个标签时观察前面已加载的标签
3. 继续打开更多标签
4. 关闭所有标签再重新打开

**表现**：

- 第 5 个标签创建时，前面已加载的 Hermes/Claude 标签内容丢失（半截 banner，无法继续加载）
- 继续打开新标签 → 黑屏，无法进入 CLI
- 关闭所有标签再打开 → 只有光标，无内容

**根因**：浏览器 WebGL context 硬限制（通常 8-16 个）。

每个 xterm.js `Terminal` 默认使用 WebGL 渲染器，创建一个 WebGL context。当超过浏览器限制时：

1. 新 context 创建导致旧 context 被浏览器回收
2. 旧 tab 的 canvas 内容丢失（terminal 渲染状态在 GPU 中，回收即丢失）
3. 后续 tab 无法创建新 context → 黑屏
4. 关闭再打开 → context 已全部失效 → 只有光标

**关键文件**：

- `src/components/TerminalView.tsx:22` — `new Terminal()` 默认用 WebGL

**修复方向**：

- **方案 A**：非活跃 tab 降级为 canvas/DOM 渲染器，释放 WebGL context 给活跃 tab
- **方案 B**：限制同时存活的 Terminal 实例数量（如最多 3 个），超出的销毁 PTY + Terminal，切回时重建
- **方案 C**：所有 tab 使用 canvas 渲染器（不用 WebGL），牺牲性能换稳定性
- **方案 D**：v1 的 `useTerminalFit` hook 中有 ResizeObserver + debounce，可能间接缓解了此问题

**v1 对比**：v1 没有此问题，可能因为 v1 的 xterm.js 版本默认用 canvas 而非 WebGL，或 v1 有其他机制限制并发 context。

---

## 当前状态

```text
git:    main, 11 commits (absolute stacking 未提交)
tests:  54 passed, 7 files, 全绿
```

## 待修复清单

| # | Bug | 严重性 | 根因 | 状态 |
|---|-----|--------|------|------|
| 1 | 窄条 | HIGH | display:contents 移除 box | ✅ 已修复（absolute stacking） |
| 2 | 黑屏 | CRITICAL | PTY 以 0×0 启动 | ✅ 已修复（absolute stacking） |
| 3 | 多标签资源耗尽 | CRITICAL | WebGL context 限制 | 待修复 |

## 修复方向

### 已完成

absolute stacking（`visibility: hidden` + `position: absolute`），解决 Bug 1 和 Bug 2。

### 下一步（Bug 3）

推荐方案 A + B 组合：
1. 非活跃 tab 降级为 canvas 渲染器（释放 WebGL context）
2. 超过 3 个 tab 时销毁最旧的非活跃 Terminal 实例，切回时重建
3. 或直接所有 tab 用 canvas 渲染器（最简单，牺牲 WebGL 性能）

Bug 3 根因：浏览器 WebGL context 硬限制。每个 xterm.js Terminal 默认创建一个 WebGL
  context，第 5 个 tab 时浏览器回收旧 context → 已加载终端内容丢失。继续开新 tab → 全部黑屏。

  最简修复：所有 tab 用 canvas 渲染器替代 WebGL。一行改动：

  // TerminalView.tsx
  const term = new Terminal({
    rendererType: "canvas",  // 默认是 "webgl"
    ...
  });

  canvas 比 WebGL 慢一些，但对终端场景足够，且不受 context 数量限制。需要的话我可以直接改。

✻ Churned for 1m 22s

❯ 保留2个方案，一是canvas,二是webgl，但限制最大tab 为4个？可以？

⏺ 可以。两种方案：

  1. Canvas 全量：所有 tab 用 canvas 渲染器，不限 tab 数，性能够用
  2. WebGL 限 4 tab：性能更好，但超 4 个时禁止新建 tab（提示用户关闭旧标签）

  或者还有第三种——混合方案：活跃 tab 用 WebGL，非活跃降级为 canvas。但 xterm.js
  不支持运行时切换渲染器，实现起来要销毁重建 Terminal，比较复杂。

  你想先做哪个？
