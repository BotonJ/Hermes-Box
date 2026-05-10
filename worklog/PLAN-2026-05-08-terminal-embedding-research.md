# Terminal Embedding 研究计划

**日期**：2026-05-08
**状态**：已完成 ✅
**目标**：评估替代 xterm.js+PTY 的方案，避免手写终端核心代码

---

## 用户澄清

- **Phase 1 拆分**：5 个独立 agent（Ghostty/WezTerm/Alacritty/Kitty/termide），warp 跳过
- **Phase 3 借壳**：作为备选方案，不优先评估
- **MVP 定义**：能正常进入 shell/agent CLI，支持同时打开 5 个标签
- **可操作性**：需在 Phase 2/3 评估中明确

---

## 背景

HermesBox v2 的 Shell tab 基于 xterm.js + tauri-pty，存在 PTY 数据类型不匹配、IPC
custom protocol 失败、Shell 初始化错误等多重问题。v1 同样技术栈但工作正常，差异来自
依赖版本和构建配置。评估是否有更简单的路径：嵌入现有终端，而非修 bug。

---

## 研究任务

### Phase 1：可嵌入终端调研（5 agent 并行）

| Agent | 目标 | 产出 |
|-------|------|------|
| A | **Ghostty / libghostty** | 可行性评分 + 最小集成路径 |
| B | **WezTerm** | 可行性评分 + 最小集成路径 |
| C | **Alacritty** | 可行性评分 + 最小集成路径 |
| D | **Kitty** | 可行性评分 + 最小集成路径 |
| E | **termide** | 可行性评分 + 最小集成路径 |

> warp 已跳过（用户确认非重点）

**每个 Agent 统一调研内容**：
1. 有无稳定的 library/C API？
2. 能编译成 .dylib/.a 吗？
3. Rust FFI 调用难度？
4. GPU 依赖（Metal/Vulkan/OpenGL）？
5. 已知的嵌入案例或 issue？
6. **MVP 路径**：能否在 5 标签场景下正常工作？

### Phase 2：Tauri 原生视图嵌入（1 agent，与 Phase 1 并行）

| Agent | 目标 | 产出 |
|-------|------|------|
| F | **Tauri WebView 外的原生视图** | 技术路径 + 代码骨架 |

研究内容：
- Tauri v2 plugin 能否注入 NSView？
- raw-window-handle 用法
- macOS 特定方案（vibrancy 已有先例）
- **MVP 路径**：注入后能否渲染终端内容？

### Phase 3：借壳方案可操作性评估（1 agent，Phase 1 后启动）

| Agent | 目标 | 产出 |
|-------|------|------|
| G | **Shell Launcher 模式** | 可行性 + 用户体验分析 |

研究内容：
1. AppleScript 能否在 iTerm2/Ghostty 中开新标签并附着 PTY？
2. 能否捕获终端输出并在 HermesBox UI 中显示？
3. **可操作性关键问题**：
   - 窗口同步延迟（帧率/响应）
   - 输入延迟容忍度
   - 多标签管理复杂度
4. 用户体验评估：是"分离窗口"还是"内嵌面板"？
5. **MVP 路径**：5 标签同时运行是否可行？

### Phase 4：综合评估与决策（Phase 1/2/3 完成后汇总）

| 输出 | 内容 |
|------|------|
| 对比矩阵 | 开发量 / 依赖风险 / 用户体验 / 跨平台 / 5 标签支持 |
| 推荐方案 | 1-2 个候选 + 最小验证路径 |
| 决策记录 | 为什么选/不选某个方案 |

---

## 执行计划

```
Phase 1 (A-E): ──────────────────────────────────────────→ Phase 4
Phase 2 (F):   ──────────────────────────────────────────→ 
Phase 3 (G):              ───────────────────────────────→ 
```

- Phase 1 的 5 个 agent 并行执行
- Phase 2 与 Phase 1 并行（Tauri 原生视图独立于终端库）
- Phase 3 在 Phase 1 完成后启动（借壳方案依赖 Phase 1 结论）
- Phase 4 在 Phase 1/2/3 全部完成后汇总

**总计**：7 个 Agent（5+1+1）

---

## 预期产出

1. `worklog/RESEARCH-2026-05-08-terminal-embedding.md` — 完整研究报告
2. 每个 Agent 的可行性评分（1-5 分，5=最优）
3. 推荐方案（1-2 个）+ MVP 验证步骤
4. 决策记录：为什么选/不选某个方案

---

## MVP 验证标准（统一）

每个方案必须验证：
- ✅ 能启动并进入 shell（bash/zsh）
- ✅ 能运行 agent CLI（如 claude-code / nanobot / hermes）
- ✅ 5 个标签同时运行稳定
- ✅ 输入延迟 < 100ms（肉眼可接受）
- ✅ 内存使用 < 500MB（5 标签合计）
