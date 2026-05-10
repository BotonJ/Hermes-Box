# HermesBox v2 重建计划 — 从脚手架逐层验证

**日期**：2026-05-08
**状态**：待执行
**起点**：`d1289b6`（feat: initialize HermesBox v2 project from official Tauri v2 + Preact scaffold）
**参照**：v1 `/Users/dor/Projects/hermes-box/`

---

## 问题回顾

v2 在脚手架之上建了 15 个 commit（4657 行），但 Shell 从未正常工作。根因是 PTY 数据流
从未在底层验证过，后续 8 个 fix commit 都在打补丁。

---

## 依赖版本对比（实际安装版本）

### npm 包

| 包名 | v1 | v2 | 状态 |
|------|-----|-----|------|
| **tauri-pty** | **0.2.1** | **0.1.1** | **降级（根因）** |
| **vitest** | **4.1.5** | **3.2.4** | **降级** |
| **@xterm/addon-search** | **0.16.0** | **0.15.0** | **降级** |
| **@xterm/addon-web-links** | **0.12.0** | **0.11.0** | **降级** |
| @tauri-apps/api | 2.10.1 | 2.11.0 | 升级 |
| @tauri-apps/cli | 2.10.1 | 2.11.1 | 升级 |
| @tauri-apps/plugin-fs | 2.5.0 | 2.5.1 | 升级 |
| preact | 10.29.1 | 10.29.1 | 相同 |
| @xterm/xterm | 5.5.0 | 5.5.0 | 相同 |
| @xterm/addon-fit | 0.10.0 | 0.10.0 | 相同 |
| @preact/preset-vite | 2.10.5 | 2.10.5 | 相同 |
| typescript | 5.9.3 | 5.9.3 | 相同 |
| vite | 6.4.2 | 6.4.2 | 相同 |

### v2 独有（v1 没有）

| 包名 | v2 版本 | 用途 |
|------|---------|------|
| @preact/signals | 2.9.0 | 响应式状态管理 |
| @tauri-apps/plugin-global-shortcut | 2.3.1 | 全局快捷键 |
| @xterm/addon-webgl | 0.18.0 | WebGL 渲染器 |
| jsdom | 29.1.1 | 测试环境 |

### v1 独有（v2 缺失）

| 包名 | v1 版本 | 影响 |
|------|---------|------|
| @tauri-apps/plugin-shell | 2.3.5 | Shell 插件（PTY 不依赖，可选） |
| happy-dom | 20.9.0 | 测试环境（v2 用 jsdom 替代） |

### Rust crate（Cargo.toml → Cargo.lock）

| crate | v1 指定 | v1 解析 | v2 指定 | v2 解析 | 状态 |
|-------|---------|---------|---------|---------|------|
| tauri | "2" | 2.10.3 | "2" | 2.11.1 | 升级 |
| tauri-plugin-pty | "0.2" | 0.2.1 | "0.2" | 0.2.1 | 相同 |
| tauri-plugin-shell | "2" | — | "2" | — | v2 有但未用 |

### Tauri 配置差异

| 配置项 | v1 | v2 | 影响 |
|--------|----|----|------|
| capabilities shell 权限 | 有 | 缺失 | Shell 插件无法调用（不影响 PTY） |
| capabilities autostart 权限 | 有 | 缺失 | 自启动功能失效 |
| CSP | 无 connect-src | 有 ipc: http://ipc.localhost | 可能影响 custom protocol |
| devUrl | localhost:1420 | localhost:5173 | 需与 vite.config 一致 |

---

## 重建步骤

### Phase 0：分支准备

```
git checkout -b v2-rebuild d1289b6
```

从脚手架 init 开新分支。main 保留完整历史作参考。

### Phase 1：依赖对齐（~15 min）

**目标**：让 v2 的依赖版本与 v1 一致或更新。

| 步骤 | 操作 | 验证 |
|------|------|------|
| 1.1 | `package.json`：`tauri-pty` 改为 `^0.2` | — |
| 1.2 | `package.json`：`vitest` 改为 `^4.1.5` | — |
| 1.3 | `package.json`：`@xterm/addon-search` 改为 `^0.16.0` | — |
| 1.4 | `package.json`：`@xterm/addon-web-links` 改为 `^0.12.0` | — |
| 1.5 | `package.json`：`preact` 改为 `^10.29.1` | — |
| 1.6 | `pnpm install` | 无报错 |
| 1.7 | `pnpm list tauri-pty` 确认 0.2.1 | 版本正确 |
| 1.8 | `pnpm tauri dev` 能启动 | 白屏即可（无组件） |

### Phase 2：Tauri 配置对齐（~10 min）

**目标**：capabilities 和 CSP 与 v1 一致。

| 步骤 | 操作 | 验证 |
|------|------|------|
| 2.1 | `capabilities/default.json`：添加 `autostart:allow-*` 权限 | — |
| 2.2 | `capabilities/default.json`：添加 `shell:allow-execute/spawn`（如需要） | — |
| 2.3 | `tauri.conf.json`：确认 CSP 与 v1 一致或简化 | — |
| 2.4 | `pnpm tauri dev` | 无 IPC 错误 |

### Phase 3：PTY 数据流验证（~30 min）— 核心步骤

**目标**：确认 PTY 数据从 Rust → JS → xterm.js 全链路通畅。

| 步骤 | 操作 | 验证 |
|------|------|------|
| 3.1 | 写最小 PTY 测试页面：创建 xterm Terminal + spawn PTY + onData 写入 | — |
| 3.2 | Console 检查 `onData` 数据类型 | 应为 `Uint8Array` 或 `number[]` |
| 3.3 | 如为 `number[]`，加 `new Uint8Array(data)` 转换 | term.write 正常渲染 |
| 3.4 | 验证 Shell 能输入命令并看到输出 | `ls`、`echo hello` 正常 |
| 3.5 | 验证 ANSI 颜色渲染 | `echo -e '\e[31mred\e[0m'` 显示红色 |
| 3.6 | 验证 resize 不崩溃 | 拖动窗口边缘 |

**关键代码**（参考 v1 `TerminalView.tsx:108`）：

```typescript
pty.onData((data: unknown) => {
  const bytes = data instanceof Uint8Array
    ? data
    : new Uint8Array(data as number[]);
  term.write(bytes);
});
```

**如 Phase 3 失败**：排查 Tauri IPC 路径（custom protocol vs postMessage），
对比 v1 的 `@tauri-apps/api` 版本。

### Phase 4：CLI 检测 + 工具库（~20 min）

**目标**：从 v1 复用工具库代码。

| 步骤 | 操作 | 来源 | 验证 |
|------|------|------|------|
| 4.1 | 复制 `cli-detect.ts` + 测试 | v1 `src/lib/cli-detect.ts` | 测试绿 |
| 4.2 | 复制 `env-capture.ts` + 测试 | v1 `src/lib/env-capture.ts` | 测试绿 |
| 4.3 | 复制 `theme.ts` + `xterm-themes.ts` | v1 `src/lib/` | 测试绿 |
| 4.4 | 复制 `validate-command.ts` | v1 `src/lib/` | 测试绿 |
| 4.5 | 复制 `exec-lookup.ts` + `file-exists.ts` | v1 `src/lib/` | 测试绿 |

### Phase 5：UI 组件（~30 min）

**目标**：从 v1 复用组件，适配 v2 架构。

| 步骤 | 操作 | 来源 | 验证 |
|------|------|------|------|
| 5.1 | 复制 `TerminalView.tsx`（含 PTY 生命周期） | v1 `src/components/` | 组件渲染 |
| 5.2 | 复制 `TabBar.tsx` | v1 `src/components/` | 组件渲染 |
| 5.3 | 复制 `CLISelector.tsx` | v1 `src/components/` | 组件渲染 |
| 5.4 | 复制 `Welcome.tsx` | v1 `src/components/` | 组件渲染 |
| 5.5 | 复制对应 `.module.css` 文件 | v1 `src/components/` | 样式正确 |
| 5.6 | 组装 `App.tsx`（参考 v1 架构） | v1 `src/App.tsx` | 多标签切换 |

**架构决策**：v1 用 `useState` + 声明式渲染，v2 用 `signals` + `TerminalManager`。
建议先用 v1 架构（已验证），后续再考虑迁移到 signals。

### Phase 6：Rust 后端（~20 min）

**目标**：从 main 分支 cherry-pick Rust 代码。

| 步骤 | 操作 | 来源 | 验证 |
|------|------|------|------|
| 6.1 | 复制 `approval.rs` | main `src-tauri/src/` | `cargo test` 绿 |
| 6.2 | 复制 `window.rs` | main `src-tauri/src/` | `cargo test` 绿 |
| 6.3 | 复制 `tray.rs` | main `src-tauri/src/` | `cargo test` 绿 |
| 6.4 | 更新 `lib.rs` 注册插件 | main `src-tauri/src/lib.rs` | `cargo check` 绿 |

### Phase 7：全量验证（~15 min）

| 步骤 | 操作 | 验证 |
|------|------|------|
| 7.1 | `pnpm test` | 全绿 |
| 7.2 | `cd src-tauri && cargo test` | 全绿 |
| 7.3 | `pnpm tauri dev` | 应用启动 |
| 7.4 | 打开 Shell tab | 能输入、输出正常 |
| 7.5 | 打开 Claude tab | 能运行 claude CLI |
| 7.6 | 打开 5 个 tab 切换 | 无崩溃、无黑屏 |
| 7.7 | 选中文本复制 | 内容非空 |
| 7.8 | 拖动窗口 resize | 终端自适应 |

---

## 提交策略

每个 Phase 完成后单独提交：

```
Phase 1: chore: align dependency versions with v1
Phase 2: fix: align Tauri capabilities and CSP with v1
Phase 3: fix: PTY data type Uint8Array conversion
Phase 4: feat: port CLI detection and utility libs from v1
Phase 5: feat: port UI components from v1
Phase 6: feat: port Rust backend modules from main
Phase 7: test: full integration verification
```

---

## 风险与回退

| 风险 | 概率 | 应对 |
|------|------|------|
| Phase 3 PTY 仍然不工作 | 低 | 排查 IPC 路径，对比 v1 的 @tauri-apps/api 版本 |
| v1 组件与 v2 脚手架不兼容 | 低 | v1/v2 都用 Preact + Vite，基本兼容 |
| cherry-pick Rust 代码冲突 | 低 | Rust 代码独立于前端，逐文件复制即可 |
| 测试环境差异（jsdom vs happy-dom） | 中 | Phase 4/5 中如测试失败，改回 happy-dom |

---

## 时间估算

| Phase | 预计耗时 | 累计 |
|-------|----------|------|
| 0. 分支准备 | 1 min | 1 min |
| 1. 依赖对齐 | 15 min | 16 min |
| 2. Tauri 配置 | 10 min | 26 min |
| 3. PTY 数据流 | 30 min | 56 min |
| 4. 工具库 | 20 min | 76 min |
| 5. UI 组件 | 30 min | 106 min |
| 6. Rust 后端 | 20 min | 126 min |
| 7. 全量验证 | 15 min | 141 min |

**总计**：约 2.5 小时。
