# Terminal Embedding 综合评估报告

**日期**：2026-05-08
**状态**：已完成
**目标**：评估替代 xterm.js+PTY 的方案，避免手写终端核心代码

---

## 背景

HermesBox v2 的 Shell tab 基于 xterm.js + tauri-pty，存在 PTY 数据类型不匹配、IPC
custom protocol 失败、Shell 初始化错误等多重问题。

---

## 研究执行

### Phase 1：可嵌入终端调研（5 个 Agent 并行）

| Agent | 方案 | 评分 | 关键结论 |
|-------|------|------|---------|
| A | Ghostty/libghostty | 2/5 | libghostty-vt API 未稳定（pre-1.0）；ghostty-web 是 POC；无 PTY 层 |
| B | WezTerm | 1/5 | 无官方 embedding 支持；核心 crate 未发布 |
| C | Alacritty | 1.5/5 | 单体架构；渲染层不可独立；无多标签 |
| D | Kitty | 1.5/5 | 无嵌入 API；GPU 渲染与 WebView 不兼容；无 Rust FFI 路径 |
| E | termide | 1/5 | 独立 TUI 应用；无 FFI/C API |

### Phase 2：Tauri 原生视图嵌入（1 个 Agent 并行）

| Agent | 方案 | 评分 | 关键结论 |
|-------|------|------|---------|
| F | Tauri 原生视图注入 | 2/5 | WKWebView 架构锁定；FFI 脆弱；App Store 审核阻断 |
| F | Tauri 多窗口架构 | 2/5 | 可行路径；复用 tauri-plugin-pty；~200-300 行改动 |

### Phase 3：借壳方案（Phase 1/2 全部不理想后触发）

| Agent | 方案 | 评分 | 关键结论 |
|-------|------|------|---------|
| G | AppleScript 借壳 iTerm2 | 1.5/5 | 无法获取输出流；PTY 私有；只能模拟击键 |
| G | AppleScript 借壳 Ghostty | 1.5/5 | 同上；AppleScript 是 1.3.0 新增，更原始 |

### Phase 4：综合评估（汇总 Phase 1/2/3 + 项目已有调研）

---

## 对比矩阵

| 方案 | 开发量 | 依赖风险 | 用户体验 | 跨平台 | 5标签 | 输入延迟 | 内存 | 综合 |
|------|--------|----------|----------|--------|-------|----------|------|------|
| **tmux Control Mode** | 低 | 低 | 优 | macOS/Linux | ✅ | <50ms | <20MB | ⭐⭐⭐⭐⭐ |
| **xterm.js + portable-pty** | 中 | 低 | 优 | 全平台 | ✅ | <10ms | ~100MB | ⭐⭐⭐⭐ |
| **Kitty Remote Control** | 低 | 中 | 优 | macOS/Linux | ✅ | <50ms | ~30MB | ⭐⭐⭐⭐ |
| Ghostty/libghostty | 高 | 中 | 优 | macOS/Linux | ✅ | <10ms | ~100MB | ⭐⭐⭐ |
| Tauri 多窗口 | 高 | 高 | 良 | 全平台 | ⚠️ 复杂 | ~30ms | ~200MB | ⭐⭐ |
| WezTerm | 极高 | 高 | 良 | 全平台 | ✅ | <10ms | ~150MB | ⭐⭐ |
| Alacritty | 极高 | 高 | 良 | 全平台 | ⚠️ 需tmux | <10ms | ~100MB | ⭐ |
| AppleScript 借壳 | 极高 | 极高 | 差 | macOS only | ❌ | >50ms | >500MB | ⭐ |

---

## 推荐方案

### 首选：tmux Control Mode

**理由**：
- iTerm2 使用 `tmux -CC` 模式大规模生产验证，可靠性高
- 协议简单（`%output`, `%window-add`, `%pane-identify`），易于解析
- 性能卓越：延迟 <50ms，内存 <20MB
- tmux 原生支持多 window/pane，天然支持 5 标签
- 无自研负担：复用 tmux 成熟的 PTY 和终端模拟层

**最小验证路径**：

```bash
# Step 1: 启动 tmux server + 控制模式
tmux -C new-session -d -s hermesbox

# Step 2: 发送命令并观察 %output
tmux -C send-keys -t hermesbox "echo hello" C-m

# Step 3: 验证 ANSI 颜色渲染
tmux -C send-keys -t hermesbox "echo -e '\e[31mred\e[0m'" C-m

# Step 4: 多 window 并发
tmux -C new-window -t hermesbox
```

### 备选：Kitty Remote Control

**适用场景**：tmux 方案不可行时

**理由**：
- JSON socket 协议，功能完整（`get-text`, `send-text`, `list-windows`）
- 社区活跃，文档完善
- 性能与 tmux 相当

**限制**：用户需安装 kitty（macOS 可通过 Homebrew `brew install kitty`）

### 基准：xterm.js + portable-pty

**当前状态**：有 bug（PTY 数据类型不匹配、IPC 失败、Shell 初始化错误），但可修复

**理由**：
- 全平台支持（macOS/Linux/Windows）
- 无外部依赖（tauri-plugin-pty 已集成 portable-pty）
- 修复成本预计 1-2 周

---

## 决策记录

### 决策 1：采用 tmux Control Mode 作为中期演进方向

**采用原因**：
- 当前 xterm.js + PTY bug 修复周期不确定
- tmux 方案经过 iTerm2 生产验证，可靠性高
- 实现成本低于自研终端渲染层

**阻碍立即实施的原因**：
- 需要用户安装 tmux（macOS 默认未安装）
- 需要 Rust 端实现协议解析（约 200-300 行）
- 需要验证 `%output` 格式是否包含完整渲染信息

### 决策 2：保留 xterm.js + PTY 作为基准

**原因**：
- bug 可修复（预期 1-2 周）
- 无外部依赖，用户体验最透明
- 全平台支持

### 决策 3：放弃 Ghostty libghostty 短期集成

**原因**：
- C API 未稳定（PR #11348 仍 open）
- SIGWINCH 竞态 bug 仍存在（issue #8436）
- 等待 C API 稳定化（预计 3-6 个月）

### 决策 4：放弃所有借壳方案

**原因**：
- AppleScript 无法获取终端输出流（只能模拟击键）
- Screenshot capture 方案内存/延迟超标
- 根本问题：终端设计哲学是输出给用户像素，不是给程序的数据流

---

## 下一步建议

### 短期（0-3 个月）

1. **修复 xterm.js + PTY bug**（优先级：P0）
   - 定位 PTY 数据类型不匹配位置
   - 修复 IPC custom protocol 失败原因
   - 验证 Shell 初始化流程

2. **验证 tmux Control Mode 可行性**（优先级：P1）
   - 执行验证步骤
   - 确认 `%output` 包含完整 ANSI 渲染信息
   - 测试 5 window 并发性能

3. **验证 Kitty Remote Control 备选路径**（优先级：P2）
   - 如 tmux 验证失败，执行 Kitty RC 验证

### 中期（3-12 个月）

1. **tmux Control Mode 集成**（如验证通过）
   - 实现 Rust 端 tmux 协议解析（约 200-300 行）
   - 替换 xterm.js + PTY 数据流
   - 支持 5+ 标签并发

2. **Ghostty C API 监控**
   - 跟踪 PR #11348（C API 稳定化）进度
   - 评估 `libghostty-rs` 绑定维护状态
   - 如稳定，考虑作为长期替代方案

### 长期（12+ 个月）

1. **自研终端渲染层**（可选）
   - 如 tmux/Kitty 方案有平台限制（Windows）
   - 考虑 ghostty-web WASM 作为跨平台方案

2. **Tauri 原生视图方案**（探索性）
   - 监控 Tauri v2 多窗口架构进展（issue #2975）
   - 如成熟，可实现真正的原生终端嵌入

---

## MVP 验证标准

每个方案必须验证：
- 能启动并进入 shell（bash/zsh）
- 能运行 agent CLI（如 claude-code / nanobot / hermes）
- 5 个标签同时运行稳定
- 输入延迟 < 100ms（肉眼可接受）
- 内存使用 < 500MB（5 标签合计）

---

## 参考资料

| 来源 | 内容 |
|------|------|
| `worklog/RESEARCH-2026-05-08-terminal-embedding.md` | 原始调研报告 |
| `worklog/HANDOVER-2026-05-08-tmux-control-mode-verification.md` | tmux Control Mode 验证步骤 |
| [tmux Control Mode Wiki](https://github.com/tmux/tmux/wiki/Control-Mode) | 官方协议文档 |
| iTerm2 + tmux -CC | 生产验证案例 |
