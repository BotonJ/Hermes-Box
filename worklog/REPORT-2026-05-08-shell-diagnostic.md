# Shell 问题诊断报告

**日期**：2026-05-08
**状态**：诊断完成，待修复
**HEAD**：`21ac6d5`（fix: Shell nested zsh, PTY spawn error visibility, ptyCleanup race）

---

## 概述

Shell tab 存在多个严重问题，核心根因是 **PTY 数据类型不匹配**：tauri-pty 返回 `number[]`（plain Array），
xterm.js 期望 `string | Uint8Array`，导致终端渲染、输入、选择全面异常。

---

## 运行时症状汇总（实机测试）

### 症状 1：首次 Shell 启动

- 一排 `>>>>>` 和可缩放 input 区域出现在 prompt 上方
- `(base) \[\]> \[\]` — conda 环境提示符，bash 的 `\[`\]` 转义在 zsh 中被原样输出
- 选中 prompt 文本 → 灰色色块，粘贴为空

### 症状 2：输入命令后黑屏

- 输入 `cd` 某路径回车 → 黑屏，无任何输出
- 切换到 Hermes tab → 黑屏
- 切换到 Claude tab → **正常输出**
- 打开 DevTools Console → 也变成黑屏

### 症状 3：新 Shell tab 行为异常

- 可以 `cd` 到某路径
- 输入 `ls` 回车 → 整个 IO 区块移动到终端下方，上方大片空白
- 选中文本复制 → 黑屏
- 再开新 Shell tab → 无法输入

### 症状分析

| 症状 | 根因 |
|------|------|
| `>>>>>` + 可缩放 input | xterm.js 的 textarea overlay（IME/无障碍），`>>>>>` 可能是 zsh heredoc 语法错误或渲染异常 |
| `(base) \[\]> \[\]` | `.zshrc` source `~/.bash_profile`，conda 的 bash prompt 语法在 zsh 中失效 |
| 选中灰色，粘贴为空 | xterm.js 选择机制依赖正确字符渲染，`number[]` 解码失败 → Buffer 中无文本 |
| cd 后黑屏 | 用户输入正常到达 PTY，PTY 输出 `term.write(number[])` 失败，新数据无法渲染 |
| Hermes 黑屏，Claude 正常 | Claude 可能输出纯文本（无 ANSI 序列），部分 `number[]` 处理碰巧成功；Hermes 输出复杂 ANSI 序列，失败更明显 |
| Console 打开后黑屏 | DevTools 触发 xterm.js resize → fitAddon.fit() → 重新渲染 → 暴露解码问题 |
| ls 后 IO 移到下方 | `number[]` 中的 ANSI CSI 序列（`\e[H`, `\e[2J`）被错误解析，光标跳转异常 |
| 新 Shell 无法输入 | 前几个 Shell 的 PTY 进程/事件监听器未正确清理，或 TerminalManager 状态异常 |

---

## 环境信息

| 项 | 值 |
|------|-----|
| tauri-plugin-pty（Rust） | 0.2.1 |
| tauri-pty（npm） | 0.1.1（最新 0.2.1） |
| @xterm/xterm | 5.5.0 |
| @tauri-apps/api | 2.8.0（npm 依赖）/ 2.11.0（项目） |
| Tauri IPC | **custom protocol 失败，回退 postMessage** |
| Shell | `/bin/zsh -l`（zsh 5.9 arm64） |

### IPC 回退

```
[Warning] IPC custom protocol failed, Tauri will now use the postMessage interface instead
TypeError: Load failed
```

Tauri 的 custom protocol IPC 失败，回退到 `postMessage`。两条路径对 `Vec<u8>` 的序列化方式可能不同，
影响 JS 侧收到的数据格式。

---

## 问题 1：PTY 数据类型不匹配

### 现象

Console 中 `[PTY-DATA]` 日志显示：

```
type: "object"
isArray: true
isUint8: false
constructor: "Array"
```

### 数据流追踪

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

### npm 包版本差异

| 版本 | `onData` 类型声明 | 实际运行时数据 |
|------|-------------------|---------------|
| v0.1.1（已安装） | `IEvent<string>` | `number[]` |
| v0.2.1（最新） | `IEvent<Uint8Array>` | `number[]` |

v0.2.1 修正了类型声明为 `Uint8Array`，但运行时数据仍然是 `number[]`（plain Array）。

### xterm.js write() 要求

```typescript
// xterm.d.ts
write(data: string | Uint8Array, callback?: () => void): void;
```

```javascript
// xterm.js InputHandler.parse()（源码）
"string" == typeof e
  ? this._stringDecoder.decode(e.substring(t,n), this._parseBuffer)
  : this._utf8Decoder.decode(e.subarray(t,n), this._parseBuffer)
```

- `string` → UTF-16 解码
- `Uint8Array` → UTF-8 解码（使用 `subarray()`）
- `number[]` → 应调用 `subarray()` 失败，但 Console 中**未观察到 TypeError**

### 未解之谜

Console 中没有 `TypeError: subarray is not a function`。`.xterm` DOM 存在（数量：1）。
可能的解释：

1. WriteBuffer 的异步错误处理（`.catch()` + `queueMicrotask`）吞掉了异常
2. Vite bundling 改变了 xterm.js 的某些行为
3. xterm.js 内部有未在源码中体现的类型兼容处理

### 修复方向

在 `pty-attach.ts` 的 `onData` 回调中，将 `number[]` 转为 `Uint8Array`：

```typescript
const dataDisposable = proc.onData((data: unknown) => {
    const bytes = data instanceof Uint8Array
        ? data
        : new Uint8Array(data as number[]);
    term.write(bytes);
    // ...
});
```

同时更新 `tauri-pty` npm 包到 v0.2.1 以获取正确的类型声明。

---

## 问题 2：Shell 初始化错误与无限循环

### 现象

PTY 数据解码后显示：

```
\e[1m\e[7m%          → zsh prompt（粗体 + 反显 + %）
\r\e[0m\e[27m        → CR + 重置所有属性
\e[7m var t          → 反显 + " var t"（片段）
\e[A\e[18C           → 光标上移 + 前移 18 列
\e[?2004l\r\r        → 禁用 bracketed paste mode
zsh: inval...        → zsh 报错！
\r\r\e[0m\e[27m      → 无限循环（重复 30+ 次）
```

### 根因分析

**`zsh: inval`**（可能是 `zsh: invalid option` 或 `zsh: invalid argument`）来自 zsh 启动过程。

Shell 初始化链：

```
spawn("/bin/zsh", ["-l"])
  → zsh 读取 /etc/zprofile
  → zsh 读取 ~/.zprofile（Homebrew、locale）
  → zsh 读取 ~/.zshrc
    → conda initialize（zsh 版）
    → PATH 配置
    → compinit
    → source ~/.bash_profile        ← 问题源头
      → source ~/.bashrc
      → . "$HOME/.local/bin/env"
      → conda initialize（bash 版，重复！）
      → . "$HOME/.cargo/env"
    → Claude Code .env
    → OpenClaw .env
    → source ~/.bash_profile        ← zsh 中 source bash 配置
```

`~/.zshrc` 中 `source ~/.bash_profile` 导致 bash-only 代码在 zsh 中执行，
可能产生语法错误或不兼容的 shell 指令。

### 无限循环机制

`zsh: inval` 输出后，shell 陷入 `\r\r\e[0m\e[27m` 循环：

- `\r\r`：两个回车
- `\e[0m`：重置所有 SGR 属性
- `\e[27m`：关闭反显

这是 zsh 的 prompt 重绘 + 属性重置在不断重复。可能原因：

1. `PROMPT_SUBST` 选项使 prompt 中的变量/命令在每次重绘时重新求值
2. 某个求值产生错误，触发 zsh 重绘 prompt
3. 重绘再次触发错误，形成循环

### 修复方向

1. 移除 `~/.zshrc` 中的 `source ~/.bash_profile`，改为直接在 zsh 中配置所需环境
2. 或者在 HermesBox 的 Shell tab 中使用 `SHELL` 环境变量替代硬编码 `/bin/zsh`
3. 确保 zsh 不会因为配置错误进入 prompt 重绘循环

---

## 问题 3：PTY 初始化时序（低优先级）

```typescript
// pty-attach.ts:52-61
const dataDisposable = proc.onData((data: string) => {
    term.write(data);
    if (!ptyReady) {
        ptyReady = true;  // 第一次收到数据就标记 ready
        for (const p of pending) { proc.write(p); }
        pending.length = 0;
    }
});
```

`ptyReady` 在收到**任何** PTY 输出时就设为 `true`。如果 `.zshrc` 在 prompt 出现前产生输出，
用户在 shell 完全初始化前输入的按键会被立即发送，可能被 shell 丢弃。

---

## 验证记录

| 检查项 | 结果 |
|--------|------|
| PTY 数据类型 | `number[]`（plain Array），非 `Uint8Array` |
| xterm.js write(number[]) | 未观察到 TypeError（原因待查） |
| .xterm DOM 存在 | 是（1 个） |
| IPC 协议 | custom protocol 失败，回退 postMessage |
| Shell 错误消息 | `zsh: inval...` |
| PTY 数据循环 | `\r\r\e[0m\e[27m` 重复 30+ 次 |
| window.__hermesTerm__ | 不存在（无法从 Console 直接测试 term.write） |

---

## 待修复清单

| 优先级 | 问题 | 修复方向 | 影响范围 |
|--------|------|----------|----------|
| **P0** | PTY 数据 `number[]` → `Uint8Array` | `pty-attach.ts` 中 `new Uint8Array(data)` + 升级 tauri-pty 到 0.2.1 | 所有 tab（Shell/Hermes/Claude） |
| **P0** | Shell 初始化 `zsh: inval` | 移除 `.zshrc` 中 `source ~/.bash_profile` | Shell tab |
| **P0** | 选中文本为空 / 粘贴为空 | 修复 P0 数据类型后应自动解决 | 所有 tab |
| **P1** | PTY 数据无限循环 | 修复 Shell 初始化后应自动解决 | Shell tab |
| **P1** | 新 Shell 无法输入 | 检查 TerminalManager 清理逻辑 + PTY 进程退出处理 | 多 tab 场景 |
| **P2** | ptyReady 时序 | 延迟 ptyReady 直到检测到 prompt | Shell tab 输入时机 |
| **P2** | IPC custom protocol 失败 | 排查 Tauri 配置 | 全局 IPC 性能 |

### 修复策略

**P0 的两个问题互相独立，需要同时修复：**

1. **数据类型修复**（`pty-attach.ts`）：一行代码，解决渲染/选择/黑屏所有症状
2. **Shell 初始化修复**（用户 `.zshrc`）：移除 `source ~/.bash_profile`，解决 `zsh: inval` 和无限循环

修复 P0 后，P1/P2 的大部分症状应自动消除。
