# CLAUDE.md — HermesBox v2

Tauri v2 + Preact + xterm.js 跨平台 AI CLI 桌面面板。全新项目，从官方脚手架重建。

## 项目结构（目标）

```
src/              # Preact 前端
  main.tsx        # Preact 渲染入口
  App.tsx         # View 状态机 + tabs
  components/     # TabBar、TerminalView、ApprovalPanel、Settings、CLISelector、Welcome
  lib/            # cli-detect、env-capture、approval-bridge 等工具
  styles/         # CSS design tokens + 组件样式
src-tauri/        # Rust 后端
  src/
    main.rs       # 3 行入口，调用 lib::run()
    lib.rs        # Builder + 插件注册 + setup
    approval.rs   # 审批流：file watcher + Tauri commands
    window.rs     # 窗口位置持久化
    tray.rs       # 系统托盘
  capabilities/   # IPC 权限声明
bridge/           # 审批流桥接脚本（Claude Code + Hermes）
```

## 技术栈

- **Rust**：Tauri v2 + tauri-plugin-single-instance + window-vibrancy
- **前端**：Preact + @preact/signals + xterm.js + TypeScript
- **构建**：Vite + pnpm

## 开发命令

```bash
pnpm tauri dev                     # 开发模式
pnpm test                          # 前端测试（vitest）
pnpm typecheck                     # TypeScript 检查
cd src-tauri && cargo test         # Rust 单元测试
cd src-tauri && cargo check        # Rust 编译检查
cd src-tauri && cargo clippy -- -D warnings  # Rust lint
```

## 架构决策

- **Signals 替代 useState**：tab 列表、view 状态、pending approvals 等用 `@preact/signals`
- **single-instance**：`tauri-plugin-single-instance` 替代手写 PID 锁
- **vibrancy**：`window-vibrancy` crate 替代手写 objc（安全封装）
- **无 objc 代码**：不在 setup 中直接调用任何 `msg_send!`
- **main.rs 仅 3 行**：所有业务逻辑在 lib.rs

## 修复/提交流程

每次完成一个**完整变更单元**后执行 test → doc → commit：

1. **运行测试** — `pnpm test` + `cd src-tauri && cargo test`，必须全绿
2. **输出文档** — 写入 `worklog/<TYPE>-YYYY-MM-DD-<slug>.md`
3. **建立提交** — conventional commit：`feat:` / `fix:` / `refactor:` / `test:` / `docs:`

## 旧项目参考

旧项目路径：`/Users/dor/Projects/hermes-box/`（保留作参考，不直接复制代码）

# 开发流程（Superpowers TDD + Worklog）

本项目遵循 [Superpowers](https://github.com/obra/superpowers) 方法论。核心纪律：

### 铁律：没有先写测试就没有生产代码

```text
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

完整周期：**RED → GREEN → REFACTOR → TEST → DOC → COMMIT**

| 步骤 | 做什么 | 验证 |
|------|--------|------|
| RED | 写一个失败的测试 | `pytest` 确认失败 + 失败原因正确 |
| GREEN | 写最少的代码让它通过 | `pytest` 确认全绿 |
| REFACTOR | 清理（不加功能） | `pytest` 保持全绿 |
| TEST | 全量测试 + lint + rumdl | `pytest tests/ -v` + `ruff check` + `rumdl check` |
| DOC | 写 worklog | `worklog/FIX-YYYY-MM-DD.md` |
| COMMIT | conventional commit | `feat:` / `fix:` / `refactor:` / `test:` / `docs:` |

### 修复/提交流程（CRITICAL）

每个**完整变更单元**后执行 test → doc → commit：

| 场景 | 触发时机 | 粒度 |
|------|----------|------|
| Bug 修复 | 修完立即 | 单 commit |
| Feature 开发 | 每个子任务完成 | TaskCreate 追踪，逻辑分组 commits |

1. **运行测试** — `python3 -m pytest tests/ -v`，必须全绿
2. **Lint + 文档检查** — `ruff check` + `rumdl check`，无问题
3. **输出 worklog** — `worklog/<TYPE>-YYYY-MM-DD-<slug>.md`
   - 症状（如有） → 根因 → 变更 → 影响范围
4. **建立提交** — conventional commit
   - `feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `chore:`

### 红旗 — 出现任何一条就停下重来

- 先写代码再补测试
- 测试一跑就过（没看到它失败）
- 说"这个太简单不用测"
- 说"先这样，测试以后加"

### Worklog 规范

每个**完整变更单元**写一篇 worklog 到 `worklog/`：

```markdown
# 标题 — 简述变更内容

**日期**：YYYY-MM-DD
**状态**：进行中 | 完成

## 变更范围

做了什么，改了哪些文件。

## 决策记录

为什么这么做，考虑了什么替代方案。

## 验证

- `pytest tests/ -v`：X passed
- `ruff check`：无问题
- `rumdl check`：无问题
```

文件命名：`worklog/<TYPE>-YYYY-MM-DD-<slug>.md`

- `FEAT-` — 新功能
- `FIX-` — 修复
- `REFACTOR-` — 重构
- `ARCH-` — 架构决策

### Markdown 文档规范（rumdl）

所有 `.md` 文件必须通过 `rumdl check`。关键规则：

- MD013：行宽 ≤ 120（宽松于默认 80）
- MD040：代码块必须指定语言
- MD041：文件首行必须是顶级标题
- MD047：文件以单个换行结尾
- MD022：标题前后有空行
- MD031/MD032：代码块和列表前后有空行

```bash
rumdl check *.md worklog/*.md    # 检查
rumdl fmt *.md                    # 自动修复
```

- **Superpowers 方法论**：`~/Downloads/Installers/superpowers-main/`
