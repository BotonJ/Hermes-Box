# CLAUDE.md — HermesBox v2

Tauri v2 + Preact + xterm.js 跨平台 AI CLI 桌面面板。

## 技术栈

- **Rust**：Tauri v2 + tauri-plugin-single-instance + window-vibrancy
- **前端**：Preact + xterm.js + TypeScript（useState，非 signals）
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

## 修复流程

每个**完整变更单元**后：test → doc → commit。

1. **运行测试** — `pnpm test` + `pnpm typecheck`，必须全绿
2. **输出 worklog** — `worklog/<TYPE>-YYYY-MM-DD-<slug>.md`
3. **提交** — conventional commit：`feat:` / `fix:` / `refactor:` / `test:` / `docs:`

## 调试纪律（血的教训）

### 禁止"猜测修复"

在没有复现日志的情况下，仅凭代码分析就修改生产代码 = 赌博。

**正确流程**：
1. 先加 debug log，拿到失败时的运行时数据
2. 从数据定位问题代码路径
3. 确认修复后，用测试验证（修复前 FAIL、修复后 PASS）
4. 移除 debug log

### 测试必须区分修复前后

单元测试的核心价值：**修复前 FAIL，修复后 PASS**。

如果测试在修复前后都 PASS = 无效测试。写完测试后必须：
1. 临时还原修复代码
2. 运行测试，确认 FAIL
3. 恢复修复代码
4. 运行测试，确认 PASS

### 不要混淆症状和根因

- "rows=5/17" 是症状，不是根因
- "useEffect vs useLayoutEffect" 是假设，不是结论
- 必须用运行时数据（日志、断点）验证假设

### Tauri 应用调试是全栈的

前端 bug 和 Rust 后端 bug 表现相同（"终端无法输入"）。
- 前端：console.log / DevTools
- 后端：Rust 日志 / `tauri dev` 终端输出
- IPC：Tauri invoke 调用链

只看前端就下结论 = 盲人摸象。

### 红旗 — 出现任何一条就停下重来

- 先写代码再补测试
- 测试一跑就过（没看到它失败）
- 说"这个太简单不用测"
- 说"先这样，测试以后加"

## 旧项目参考

旧项目路径：`/Users/dor/Projects/hermes-box/`（保留作参考，不直接复制代码）
