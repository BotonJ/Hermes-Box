# FIX: Shell prompt 显示 `%` 和 `\[\]` 转义序列

**日期**: 2026-05-11
**分支**: v2-rebuild
**状态**: 已修复

## 问题现象

Shell tab 启动后显示：`% (base) \[\]> \[\]`

- `%` — 出现在 prompt 最上方，反显样式
- `\[\]` — bash 风格的非打印字符定界符，zsh/xterm.js 不识别，直接显示为字面量
- `(base)` — conda 环境标识

## 排查过程

### 第一步：确认 `%` 来源

用 Python 模拟 PTY 启动 zsh，抓取原始字节流：

```python
python3 -c "
import subprocess, time, os
master, slave = os.openpty()
p = subprocess.Popen(['zsh', '-l'], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
time.sleep(2)
p.kill()
out = os.read(master, 4096)
os.close(master)
import sys
sys.stdout.buffer.write(out[:200])
" 2>&1 | xxd | head -15
```

输出：

```
00000000: 1b5b 316d 1b5b 376d 251b 5b32 376d 1b5b  .[1m.[7m%.[27m.[
00000010: 316d 1b5b 306d 2020 2020 2020 2020 2020  1m.[0m
...
00000060: 2020 2020 200d 200d                           . .
```

这是 zsh 的 **PROMPT_SP** 特性（`setopt PROMPTSP`）。当 zsh 检测到上一行输出没有以换行结尾时，在 prompt 前插入一个反显的 `%` 并换行。

完整 ANSI 序列：`\e[1m\e[7m%\e[27m\e[1m\e[0m` + 大量空格 + `\x0d \x0d`

### 第二步：确认 `\[\]` 来源

```bash
echo "$PS1"
# 输出：(base) \[\e[34m\]${currentWorkingDir}> \[\e(B\e[m\]
```

这是 **conda** 通过 `.zshrc` 的 `eval "$__conda_setup"` 设置的 PROMPT。conda 用了 bash 风格的 `\[` `\]` 非打印字符定界符，zsh 不识别。

`.zshrc` 顺序：
1. 第 2-15 行：conda hook → 设置带 `\[\]` 的 PROMPT
2. 第 61 行：用户自设 `PROMPT='%F{blue}%~%f> '` → 但被 conda 的 `conda activate base` 覆盖

### 第三步：对比 git 历史找差异

```bash
git tag -l                    # v2-phase4-stable
git show v2-phase4-stable:src/App.tsx | grep "spawn"
# spawn("/bin/zsh", [], { env: { TERM: "xterm-256color" } })
```

Tag 时也没有 `%` 的原因是：当时用 `tauri-plugin-pty`，PTY 启动 zsh 不带 `-l`，且没有 captureShellEnv。但实际上 `%` 在 PTY 中是 zsh 的固有行为，之前可能没注意到。

### 第四步：尝试过的方案（失败）

| 方案 | 结果 | 原因 |
|------|------|------|
| 改 `shellArgs` 从 `["-l"]` 为 `[]` | 无效 | zsh 检测到 PTY stdin 自动进入交互模式 |
| 环境变量 `PROMPT_SP=""` | 无效 | zsh 不从环境变量读这个选项 |
| 启动前写 `\n` 到 PTY | 无效 | PROMPT_SP 在 zsh 初始化时就产生 |
| `zsh -c 'unsetopt PROMPTSP; exec zsh'` | 无效 | 第二个 zsh 实例重新启用默认选项 |
| `zsh --no-rcs` | `%` 仍在 | PROMPTSP 是 zsh 编译时默认值 |
| 传 env 中清理 PS1 | 无效 | `.zshrc` 的 conda hook 重新覆盖 PROMPT |

## 最终修复

### `%` — 前端过滤 PROMPT_SP ANSI 序列

**文件**: `src/components/TerminalView.tsx`

PROMPT_SP 只在 shell 启动时输出一次。在 PTY 第一次输出数据时用正则剥离：

```typescript
const PROMPT_SP_RE = /\x1b\[1m\x1b\[7m%\x1b\[27m\x1b\[1m\x1b\[0m[^\x0d]*\x0d \x0d/;

// 在 pty.onData 回调中，首次数据时过滤
if (!promptSpStripped.current) {
  const text = new TextDecoder().decode(bytes);
  const stripped = text.replace(PROMPT_SP_RE, "");
  if (stripped !== text) {
    promptSpStripped.current = true;
    bytes = new TextEncoder().encode(stripped);
  }
}
```

### `\[\]` — 未修复（用户环境问题）

`\[\]` 来自 conda 在 `.zshrc` 中设置的 bash 风格 PROMPT。这不是应用 bug，iTerm2 中同样存在。修复需要用户在 `.zshrc` 的 conda hook 之后重新设置 zsh 风格的 PROMPT，或在 `.zshrc` 中添加：

```zsh
# 在 conda initialize 之后
PROMPT='%F{blue}%~%f> '
```

## 诊断清单（未来遇到类似问题）

1. **`%` 字符** → zsh PROMPT_SP，用 `xxd` 抓 PTY 原始输出确认
2. **`\[\]` 字符** → bash PS1 转义序列在 zsh 中显示，查 `echo $PS1` 确认来源
3. **`(base)` 前缀** → conda 环境标识，正常行为
4. **对比历史版本** → `git show <commit>:src/` 对比 spawn 参数和 env 传递
5. **模拟 PTY** → 用 Python `os.openpty()` 复现，排除前端代码干扰

---

## 追加修复：CLI 命令路径回显

**日期**: 2026-05-11
**状态**: 已修复

### 问题现象

启动 Claude/Hermes tab 时，终端顶部多出命令路径：

```
/opt/homebrew/bin/claude
(base) \[\]> \[\]/opt/homebrew/bin/claude
```

### 根因

CLI tab 的 `command` 参数（如 `/opt/homebrew/bin/claude`）通过 `scheduleCommand` 在 PTY 启动 400ms 后写入 shell 标准输入。shell 的终端驱动层 **echo 机制**把输入回显到终端，导致命令路径显示出来。

数据流：

```
TerminalView → scheduleCommand → pty.write("/opt/homebrew/bin/claude\n")
                                         ↓
                               shell 终端驱动 echo 回显
                                         ↓
                               xterm.js 显示命令路径
```

### 关键洞察

**写入 PTY stdin = 写入 shell 输入 = 一定被 echo 回显。** 这是终端驱动层的行为，无法通过 `stty -echo` 避免（因为 `stty` 命令本身也会被回显）。

### 尝试过的方案（失败）

| 方案 | 结果 | 原因 |
|------|------|------|
| `stty -echo && command && stty echo` | 失败 | 整行被回显，只是把问题从命令路径变成整行 |
| 前端过滤含命令路径的行 | 不可靠 | 回显内容可能被分到多个 PTY 数据块 |
| ANSI 转义覆盖回显行 | 不可靠 | 终端驱动 echo 和 PTY 读取存在时序竞争 |

### 最终修复：Rust 层 exec 替代 stdin 写入

**核心思路**：不在 shell 启动后写入命令，而是在 PTY spawn 时直接让 shell `exec` 命令。

**Rust 端** (`src-tauri/src/pty.rs`):

```rust
// 新增 exec_command 参数
pub async fn pty_spawn(
    ...
    exec_command: String,  // 新参数
    ...
) -> Result<u32, String> {
    let mut cmd = CommandBuilder::new(&command);
    if exec_command.is_empty() {
        // Shell tab: 正常 spawn
        cmd.args(&args);
    } else {
        // CLI tab: zsh -l -c "exec <command>"
        // shell 加载 .zshrc 获取完整 env，然后 exec 替换为 CLI 进程
        cmd.args(&args);
        cmd.arg("-c");
        cmd.arg(format!("exec {exec_command}"));
    }
    ...
}
```

**前端** (`src/lib/pty.ts`):

```typescript
// SpawnOptions 新增 execCommand
interface SpawnOptions {
  ...
  execCommand?: string;
}

// invoke 传参
invoke("pty_spawn", {
  ...
  execCommand: options?.execCommand ?? "",
  ...
});
```

**TerminalView** (`src/components/TerminalView.tsx`):

```typescript
const pty = spawn(shell, shellArgs, {
  ...
  execCommand: command || undefined,  // 有 command 时走 exec 路径
});
```

**scheduleCommand** (`src/lib/schedule-command.ts`):

改为 no-op，因为命令已由 Rust spawn 层处理。

### 经验法则

1. **不要通过 PTY stdin 写入命令** — 终端驱动会 echo，无法可靠隐藏
2. **用 `exec` 替换进程** — shell 加载配置后 `exec command`，不产生 prompt、不回显
3. **修改 PTY spawn 参数比后处理输出更可靠** — 从源头避免问题，而非事后过滤

### 修改文件清单

| 文件 | 变更 |
|------|------|
| `src-tauri/src/pty.rs` | 新增 `exec_command` 参数，spawn 时用 `-c "exec ..."` |
| `src/lib/pty.ts` | `SpawnOptions` 新增 `execCommand`，invoke 传参 |
| `src/components/TerminalView.tsx` | 传 `execCommand` 给 spawn，移除 `scheduleCommand` 调用 |
| `src/lib/schedule-command.ts` | 改为 no-op |
| `src/lib/schedule-command.test.ts` | 简化为 no-op 测试 |
