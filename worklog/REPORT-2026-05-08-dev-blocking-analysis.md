# HermesBox v1 与 v2 开发报告

**日期**：2026-05-08
**来源**：hermes-box 和 hermes-box-v2 项目 worklog 汇总

---

## 项目背景

| 项目 | 定位 | 状态 |
|------|------|------|
| **hermes-box** (v1) | Tauri v2 跨平台 AI CLI 桌面面板，Phase 3 完成 | 维护模式 |
| **hermes-box-v2** (v2) | 从官方脚手架全新重建，Tauri v2 + Preact Signals | 开发中（阻塞） |

---

## 技术栈

### v1（hermes-box）

- **前端**：Preact + TypeScript + xterm.js
- **后端**：Rust + Tauri v2
- **桥接**：Shell 脚本（Claude Code approval、Hermes approval）
- **测试**：112 前端 + 28 Rust = 140 tests

### v2（hermes-box-v2）

- **前端**：Preact + @preact/signals + xterm.js + TypeScript
- **后端**：Rust + Tauri v2 + tauri-plugin-pty + tauri-plugin-single-instance
- **构建**：Vite + pnpm

---

## 开发历程

### v1 开发历程

| 日期 | 内容 |
|------|------|
| 2026-04-29 | UI Design System Phase 1+2 完成（7 组件 design tokens 注入） |
| 2026-05-03 | Approval phase 2.2 完成、session 持久化、主题简化、Toast 通知 |
| 2026-05-04 | Code review 3 commits、Hermes banner 文字颜色修复 |
| 2026-05-05 | Icon 替换、review round2、bridge 安装 |
| 2026-05-06 | 窗口布局 Bug 修复（alwaysOnTop + setLevel）、Light theme terminal bg、Limit Ring 集成调研、Titlebar 透明度调研 |

### v2 开发历程

| 日期 | 内容 |
|------|------|
| 2026-05-07 | P1 Rust 后端骨架（approval/window/tray 模块，27 tests）<br>P2 前端骨架（cli-detect/env-capture + 5 组件，50 tests）<br>Start 按钮修复（PTY 插件注册）<br>Tab 切换重启 CLI 修复 |
| 2026-05-08 | 全面安全审核（3 CRITICAL + 10 HIGH + 8 MEDIUM 修复）<br>Tab Unmount 根因修复（命令式 TerminalManager）<br>Terminal embedding 技术调研（tmux Control Mode 发现） |

---

## 实机测试阻塞问题

### 问题 1：PTY 数据类型不匹配（CRITICAL）

**现象**：

- 终端渲染失败、选中文本为空、粘贴为空、黑屏
- Console 中 `[PTY-DATA]` 显示 `type: "object", isArray: true, isUint8: false, constructor: "Array"`

**根因链路**：

```
Rust tauri-plugin-pty::read()
  → 返回 Vec<u8>（原始字节）
  → serde_json::to_string → JSON 数组 [72,101,108,...]
  → Tauri IPC（postMessage 回退路径）
  → JS 侧 invoke() 返回 number[]
  → tauri-pty readData() → this._onData.fire(data)
  → pty-attach.ts onData(data: string) ← 类型声明错误
  → term.write(data) ← 实际传入 number[]
```

**npm 包版本差异**：

| 版本 | `onData` 类型声明 | 实际运行时数据 |
|------|-------------------|---------------|
| v0.1.1（已安装） | `IEvent<string>` | `number[]` |
| v0.2.1（最新） | `IEvent<Uint8Array>` | `number[]` |

**修复方向**：

在 `pty-attach.ts` 的 `onData` 回调中，将 `number[]` 转为 `Uint8Array`：

```typescript
const dataDisposable = proc.onData((data: unknown) => {
    const bytes = data instanceof Uint8Array
        ? data
        : new Uint8Array(data as number[]);
    term.write(bytes);
});
```

同时更新 `tauri-pty` npm 包到 v0.2.1 以获取正确的类型声明。

---

### 问题 2：WebGL context 耗尽（CRITICAL）

**现象**：

- 第 5 个标签创建时，前面已加载的 Hermes/Claude 标签内容丢失
- 继续打开新标签 → 黑屏，无法进入 CLI
- 关闭所有标签再打开 → 只有光标，无内容

**根因**：

浏览器 WebGL context 硬限制（通常 8-16 个）。每个 xterm.js `Terminal` 默认使用 WebGL 渲染器，创建一个 WebGL context。当超过浏览器限制时：

1. 新 context 创建导致旧 context 被浏览器回收
2. 旧 tab 的 canvas 内容丢失（terminal 渲染状态在 GPU 中，回收即丢失）
3. 后续 tab 无法创建新 context → 黑屏
4. 关闭再打开 → context 已全部失效 → 只有光标

**修复方向**：

所有 tab 用 canvas 渲染器替代 WebGL，一行改动：

```typescript
// TerminalView.tsx
const term = new Terminal({
  rendererType: "canvas",  // 默认是 "webgl"
  ...
});
```

---

### 问题 3：Shell 初始化错误 + 无限循环（HIGH）

**现象**：

- 首次 Shell 启动出现 `>>>>>` 和可缩放 input 区域
- `(base) \[\]> \[\]` — conda 环境提示符语法错误
- 选中文本灰色，粘贴为空
- 输入 `cd` 某路径回车 → 黑屏
- 新 Shell tab 中 `ls` 后 IO 区块移动到终端下方

**根因**：

`~/.zshrc` 中 `source ~/.bash_profile` 导致 bash-only 代码在 zsh 中执行，产生语法错误或不兼容的 shell 指令。

Shell 初始化链：

```
spawn("/bin/zsh", ["-l"])
  → zsh 读取 ~/.zshrc
    → conda initialize（zsh 版）
    → source ~/.bash_profile        ← 问题源头
      → source ~/.bashrc
      → conda initialize（bash 版，重复！）
```

`zsh: inval` 输出后，shell 陷入无限循环：`\r\r\e[0m\e[27m` 重复 30+ 次。

**修复方向**：

1. 移除 `~/.zshrc` 中的 `source ~/.bash_profile`，改为直接在 zsh 中配置所需环境
2. 或者在 HermesBox 的 Shell tab 中使用 `SHELL` 环境变量替代硬编码 `/bin/zsh`
3. 确保 zsh 不会因为配置错误进入 prompt 重绘循环

---

### 问题 4：Tab 切换导致所有 PTY 重启（HIGH）

**状态**：✅ 已修复

**根因**：

Preact Signals 触发整个 App 重渲染 → 所有 TerminalView unmount → PTY 被 cleanup kill → 重新 spawn。

```
每次新增 tab = 全部 N 个 tab 重建 = N 次 PTY kill + N 次 PTY spawn
```

**解决方案**：

命令式 TerminalManager，Terminal 生命周期脱离 Preact 管理：

1. `App` 只渲染一个空的 `<div ref={terminalContainerRef}>`
2. `useEffect` 监听 `tabs.value` 变化，做增量 diff
3. 新 tab → 创建 Terminal + PTY，append 到 DOM
4. 关闭 tab → kill PTY + dispose Terminal，remove DOM
5. 切换 tab → 只改 `visibility`，不触发生命周期

---

## v1 的关键问题

### 窗口布局 Bug

**根因**：三重

| 层 | 位置 | 原值 | 修复 |
|----|------|------|------|
| 1 | `tauri.conf.json` | `alwaysOnTop: true` | `false` |
| 2 | `window.rs:apply_ns_panel_style` | `setLevel: 3` (NSFloatingWindowLevel) | `setLevel: 0` (NSNormalWindowLevel) |
| 3 | `~/Library/.../window-position.json` | `x:1476, width:1818`（1920 屏偏右超出） | 删除 + 防保存 |

**坏坐标无限重生循环**：

`toggle_window_visibility` 在窗口隐藏时调用 `read_window_position` → `save_position_to_disk`，把当前坐标写回磁盘。启动时 `load_position_from_disk` 读取并恢复。即使 `is_valid_position` 收紧边界（`MAX_DIM 4000`, `MAX_COORD 4000`），`x:1476` 仍能通过校验。

### 设置页面被色块遮挡

**根因**：

App.tsx 中 `terminalContainer` 和 `contentArea` 都有 `flex: 1`。当 `view === "settings"` 时，两个 flex 容器平分高度——下半部分是 `terminalContainer`（`background: var(--terminal-bg)`），遮挡了 Settings 内容。

**修复方案**：`terminalContainer` 仅在 `view === "terminal"` 时渲染。

---

## Terminal Embedding 技术调研结论

| 方案 | 评分 | 结论 |
|------|------|------|
| **tmux Control Mode** | ⭐⭐⭐⭐⭐ | 首选——iTerm2 生产验证，协议简单，<50ms 延迟 |
| **Kitty Remote Control** | ⭐⭐⭐⭐ | 备选——JSON socket 协议 |
| xterm.js + PTY（当前） | N/A | Bug 可修复，继续使用 |
| Ghostty / libghostty | 2.5/5 | C API 不成熟，SIGWINCH 竞态 |
| Tauri 原生视图 | 2/5 | 视图层级遮挡问题 |

**tmux Control Mode 核心原理**：

- tmux `-C` 启动控制模式客户端
- 通过 stdin/stdout 发送命令并接收机器可读格式的输出（`%output`, `%window-add` 等）
- `capture-pane -p` 获取 pane 内容（含 ANSI 渲染信息）
- iTerm2 已在生产环境使用 `tmux -CC` 模式

---

## 安全问题（已修复）

### v2 全面安全审核修复

| 严重级别 | 发现数 | 状态 |
|----------|--------|------|
| CRITICAL | 3 | 3 已修复 |
| HIGH | 10 | 10 已修复 |
| MEDIUM | 8 | 8 已修复 |
| LOW | 3 | 3 已记录 |

**CRITICAL 修复项**：

1. **C-1**：`isCommandSafe` 允许 shell 重定向和参数注入（`>`、`<`、`*` 等未拦截）→ 改为严格允许列表
2. **C-2**：Bridge 脚本 `echo "$INPUT"` 解释转义序列 → 改用 `printf '%s\n'`
3. **C-3**：`shell:allow-open` 权限未限定作用域 → 移除该权限

---

## 验证状态（v2，截至 2026-05-08）

| 检查 | 结果 |
|------|------|
| `pnpm test` | 108 passed (10 files) |
| `pnpm typecheck` | clean |
| `cargo test` | 27 passed |
| `cargo clippy -- -D warnings` | clean |
| 3 tab 切换 session 保持 | ✓ |
| 4+ tab 所有 tab 重建 | ✗（Bug 3 待修复） |

---

## 核心架构决策

1. **Signals 全局状态**：v2 用 `@preact/signals` 替代 useState，模块级 signal 避免 prop drilling
2. **命令式 TerminalManager**：解决 Preact 重渲染导致的 PTY 生命周期问题
3. **无 objc 代码**：v2 不用 `msg_send!`，用 `window-vibrancy` crate 替代
4. **single-instance 插件**：`tauri-plugin-single-instance` 替代手写 PID 锁

---

## 修复优先级

| 优先级 | 问题 | 修复方向 | 影响范围 |
|--------|------|----------|----------|
| **P0** | PTY 数据 `number[]` → `Uint8Array` | `pty-attach.ts` 中 `new Uint8Array(data)` + 升级 tauri-pty 到 0.2.1 | 所有 tab |
| **P0** | WebGL context 耗尽 | `rendererType: "canvas"` | 所有 tab |
| **P0** | Shell 初始化 `zsh: inval` | 移除 `~/.zshrc` 中 `source ~/.bash_profile` | Shell tab |
| **P1** | PTY 数据无限循环 | 修复 Shell 初始化后应自动解决 | Shell tab |
| **P1** | 新 Shell 无法输入 | 检查 TerminalManager 清理逻辑 + PTY 进程退出处理 | 多 tab 场景 |

---

## 后续行动

### 立即行动（阻塞解除）

1. **修复 PTY 数据类型**（P0）
   - `pty-attach.ts` 中 `new Uint8Array(data)` 转换
   - 升级 `tauri-pty` npm 包到 v0.2.1

2. **修复 WebGL context 耗尽**（P0）
   - 所有 Terminal 实例加 `rendererType: "canvas"`

3. **通知用户修复 Shell 初始化**（P0）
   - 移除 `~/.zshrc` 中 `source ~/.bash_profile`

### 短期（2-4 周）

1. 验证 tmux Control Mode 方案（如需长期演进）
2. 监控 Ghostty C API 稳定化进度

---

*报告生成时间：2026-05-08*