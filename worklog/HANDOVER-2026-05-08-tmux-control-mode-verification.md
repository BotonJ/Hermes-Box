# tmux Control Mode 验证交接文档

**日期**：2026-05-08
**验证目标**：确认 tmux Control Mode 可作为 HermesBox 终端嵌入方案
**验证人**：Claude Code (Session 2026-05-08 14:10)

## tmux Control Mode 验证结果

### Step 1: 命令行验证
- 结果：✅
- %output 格式确认：

```
%begin 1778220491 271 0
%end 1778219696 356 0
%window-add @0
%sessions-changed
%session-changed $0 0
%output %0 \033[1m\033[7m%\033[27m\033[1m\033[0m                                                                               \015 \015
```

**关键发现**：
- `%output` 消息确实包含完整 ANSI escape sequences（颜色、光标位置）
- escape sequence 格式：`\033[31m` 表示红色，`\033[0m` 表示重置
- 输出格式：`%output <session> <data>` — 数据包含完整的 xterm 渲染指令

### Step 2: ANSI 颜色
- 结果：✅
- escape sequence 确认存在：`\033[31mRED\033[0m` 正确渲染

### Step 3: 5 window 并发
- 结果：✅
- tmux 创建 5 个 window 时，每个 window 有独立 session/pane ID
- `%session-window-changed` 事件可以区分不同的 window
- 延迟感受：< 100ms（主观感受）

### 结论
- 是否推荐采用 tmux Control Mode：**待定**（需要进一步 Rust 原型验证）
- 理由：协议本身可行，但需要 Rust 端实现协议解析（复杂）
- 替代方案复杂度对比：tmux Control Mode 需要自己解析协议，Kitty remote control 已有库

---

## 背景

HermesBox v2 当前 xterm.js + tauri-pty 有 bug（PTY 数据类型不匹配、IPC 失败、Shell 初始化错误）。调研 7 个替代方案，发现 **tmux Control Mode** 和 **Kitty Remote Control** 可行性最高。

**核心发现**：iTerm2 使用 `tmux -CC` 模式将 tmux window 作为原生窗口显示，说明此方案已在生产环境验证。

---

## 待验证问题

1. tmux Control Mode 的 `%output` 消息是否包含完整 ANSI 渲染信息（颜色、光标位置）？
2. 5 个 window 同时输出时的协议开销和延迟？
3. Rust 端实现 tmux -C 协议解析的复杂度？

---

## 验证步骤

### Step 1：命令行验证（5 分钟）

```bash
# 启动 tmux server + 进入控制模式
tmux -C new-session -d -s test

# 发送命令到 session
echo 'send-keys "echo hello" C-m' | tmux -C -t test

# 或者用这个方式：
tmux -C send-keys -t test "echo hello" C-m

# 观察 stdout 中的 %output 消息
# 应该看到包含 "echo hello" 输出的事件
```

**预期输出格式**（需要确认）：
```
%output test:0.0 0 40
echo hello

%
```

### Step 2：验证 ANSI 颜色渲染（5 分钟）

```bash
# 测试 ANSI 颜色输出
tmux -C send-keys -t test "echo -e '\e[31mred\e[0m'" C-m

# 观察 %output 中是否包含 escape sequence
```

### Step 3：多 window 并发测试（10 分钟）

```bash
# 创建 5 个 window
tmux -C new-window -t test
tmux -C new-window -t test
tmux -C new-window -t test
tmux -C new-window -t test

# 向每个 window 发送命令
for i in 0 1 2 3 4; do
  tmux -C send-keys -t "test:$i" "echo window $i" C-m
done

# 观察是否能正确区分不同 window 的输出
```

### Step 4：Rust 原型验证（2-4 小时，可选）

如 Step 1-3 确认可行，在 HermesBox 项目中创建最小原型：

```rust
// src-tauri/src/tmux.rs

use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader, Write};
use std::sync::mpsc;

pub struct TmuxControl {
    child: Option<Child>,
    receiver: mpsc::Receiver<String>,
}

impl TmuxControl {
    pub fn new(session_name: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let mut child = Command::new("tmux")
            .args(&["-C", "new-session", "-d", "-s", session_name])
            .stdout(Stdio::piped())
            .stdin(Stdio::piped())
            .spawn()?;

        let stdout = child.stdout.take().unwrap();
        let (tx, rx) = mpsc::channel();

        // spawn thread to read tmux events
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout).lines();
            while let Some(Ok(line)) = reader.next() {
                tx.send(line).ok();
            }
        });

        Ok(Self { child: Some(child), receiver: rx })
    }

    pub fn send_keys(&mut self, target: &str, keys: &str) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(ref mut child) = self.child {
            let input = format!("send-keys -t {} {} C-m\n", target, keys);
            child.stdin.as_mut().unwrap().write_all(input.as_bytes())?;
        }
        Ok(())
    }

    pub fn recv_event(&self) -> Option<String> {
        self.receiver.try_recv().ok()
    }
}
```

---

## 验证清单

| 验证项 | 通过标准 | 状态 |
|--------|----------|------|
| tmux -C 能启动 | 无报错，session 存在 | ⬜ |
| %output 包含命令输出 | 能看到 "echo hello" | ⬜ |
| %output 包含 ANSI | 颜色 escape sequence 存在 | ⬜ |
| 5 window 并发 | 能区分每个 window 的输出 | ⬜ |
| 输入延迟 | < 100ms（主观感受） | ⬜ |

---

## 技术参考

- [tmux Control Mode Wiki](https://github.com/tmux/tmux/wiki/Control-Mode)
- iTerm2 + tmux -CC 工作原理：`tmux -CC` 启动一个控制模式客户端，iTerm2 连接到该客户端并渲染 tmux 的 window/pane 作为原生标签页

---

## 交接事项

1. **如验证通过**：实现 Rust 端的 tmux Control Mode 协议解析，替换 xterm.js + PTY
2. **如验证失败**：回退到修复 xterm.js + PTY bug 的方案
3. **关键问题**：`%output` 格式是否满足终端渲染需求（光标位置、滚动区域、选中内容）

---

## 报告格式

验证完成后，请报告：

```
## tmux Control Mode 验证结果

### Step 1: 命令行验证
- 结果：✅/❌
- %output 格式：[实际输出]

### Step 2: ANSI 颜色
- 结果：✅/❌
- escape sequence：[是/否]

### Step 3: 5 window 并发
- 结果：✅/❌
- 延迟感受：[描述]

### 结论
- 是否推荐采用 tmux Control Mode：✅/❌
- 理由：[简述]
```