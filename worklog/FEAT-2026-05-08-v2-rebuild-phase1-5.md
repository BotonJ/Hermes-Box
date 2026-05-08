# HermesBox v2 重建 — Phase 1~5 完成

**日期**：2026-05-08
**状态**：完成
**分支**：v2-rebuild
**起点**：d1289b6（脚手架 init）

---

## 概述

从脚手架 commit 逐层重建 v2，完成 5 个阶段。PTY 数据流已验证可用，UI 组件从 v1 移植，112 测试全绿。

## Phase 1：依赖对齐

**变更**：package.json 依赖版本升级

| 包 | 旧版本 | 新版本 | 影响 |
|---|--------|--------|------|
| tauri-pty | 0.1.1 | 0.2.1 | **根因修复** |
| vitest | 3.2.4 | 4.1.5 | 测试框架升级 |
| @xterm/addon-search | 0.15.0 | 0.16.0 | 搜索功能 |
| @xterm/addon-web-links | 0.11.0 | 0.12.0 | 链接检测 |
| preact | 10.22.0 | 10.29.1 | 框架版本 |

**验证**：`pnpm install` 无报错，`pnpm typecheck` 通过

## Phase 2：Tauri 配置对齐

**变更**：

- `capabilities/default.json`：补齐 PTY 权限（spawn/read/write/resize/kill/exitstatus）、shell execute/spawn 命令白名单、autostart 权限、FS 路径白名单
- `tauri.conf.json`：CSP 改为 `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'`
- `Cargo.toml`：添加 `tauri-plugin-pty = "0.2"`
- `lib.rs`：注册 `tauri_plugin_pty::init()`

**验证**：`cargo check` 通过，`pnpm tauri dev` 启动成功

## Phase 3：PTY 数据流验证

**发现**：`tauri-pty` 的 `onData` 回调返回 `number[]`（普通数组），不是 `Uint8Array`。这是 Tauri IPC 反序列化的已知行为。

**修复**：

```typescript
pty.onData((data: unknown) => {
  const bytes = data instanceof Uint8Array
    ? data
    : new Uint8Array(data as number[]);
  term.write(bytes);
});
```

**手动验证**：
- Shell 输入输出正常
- `echo -e '\e[31mred\e[0m'` 渲染红色文字
- 数据持续流动（多个 onData 事件，长度 1~1024）

## Phase 4：CLI 检测 + 工具库移植

**移植文件**（14 个）：

| 模块 | 用途 |
|------|------|
| cli-detect.ts | CLI 注册表 + 检测逻辑 |
| env-capture.ts | Shell 环境变量捕获 + 过滤 |
| theme.ts | 主题管理（dark/light/system） |
| xterm-themes.ts | Gruvbox Dark + macOS Grass 配色 |
| validate-command.ts | 命令路径安全校验 |
| exec-lookup.ts | which + login shell 降级查找 |
| file-exists.ts | Tauri FS exists 封装 |

**新增配置**：vitest environment 改为 jsdom

**验证**：66 tests passing

## Phase 5：UI 组件移植

**移植组件**（4 个）：

| 组件 | 功能 |
|------|------|
| TerminalView | PTY 生命周期、键盘缩放、主题监听 |
| TabBar | 标签切换、关闭、新增、设置按钮 |
| CLISelector | CLI 检测卡片 + Shell 选项 |
| Welcome | 引导页 |

**移植辅助模块**（7 个）：i18n、use-locale、schedule-command、use-terminal-fit + 对应测试 + locale JSON

**简化 App.tsx**：不含 Settings、ApprovalPanel、Toast（Phase 6 后续）

**修复**：
- TerminalView PTY 数据类型 Uint8Array 转换
- jsdom 缺少 ResizeObserver → 测试中添加全局 mock
- 移除未使用的类型导入（TS noUnusedLocals）

**验证**：112 tests passing

---

## 测试汇总

| 阶段 | 测试数 | 状态 |
|------|--------|------|
| Phase 4 | 66 | 全绿 |
| Phase 5 | 112（含 Phase 4） | 全绿 |

## Git 状态

```
v2-phase4-stable → 0aa1679（安全回退点）
bcf9a80 feat: port UI components from v1
0aa1679 feat: port CLI detection and utility libs from v1
5c99fd7 fix: PTY data type Uint8Array conversion
44eb958 fix: align Tauri capabilities and CSP with v1
da1c688 chore: align dependency versions with v1
d1289b6 feat: initialize HermesBox v2 project from scaffold
```

## 待完成

- **Phase 6**：Rust 后端（approval.rs、window.rs、tray.rs）
- **Phase 7**：全量验证

## 决策记录

1. **先用 v1 架构（useState）**：不迁移到 signals，已验证稳定
2. **简化 App.tsx**：不含 Settings/Approval/Toast，降低移植风险
3. **jsdom 替代 happy-dom**：v2 脚手架选择 jsdom，添加 ResizeObserver mock
4. **PTY Uint8Array 转换**：在 onData 层统一处理，不修改 tauri-pty
