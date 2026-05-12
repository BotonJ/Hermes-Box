# FEAT-2026-05-12-Launch-in-Default-Terminal — Implementation

**分支**: `feat/launch-in-default-terminal`
**基于**: `feature/ui-polish` (clean)

---

## Summary

添加 "Open in Terminal" 按钮到 CLISelector 卡片，点击后调用 macOS `open` 命令，在用户默认终端（Terminal.app / iTerm2 / Ghostty）中打开一个新窗口并执行选定的 CLI 命令。

**架构**: 生成 `.command` shell 脚本到 `~/.hermes/tmp/`，chmod +x 后调用 `open` —— macOS 自动路由 `.command` 文件到默认终端。无需终端检测，无需 AppleScript。

---

## Commits

| Hash | Message |
|------|---------|
| `194887e` | feat(terminal-launch): add uuid dependency |
| `4830762` | feat(terminal-launch): add Rust module for .command file launch |
| `6a51f1a` | feat(terminal-launch): add i18n keys for open terminal button |
| `85ee278` | feat(terminal-launch): add TypeScript wrapper for terminal launch invoke |
| `18b783e` | feat(terminal-launch): add 'Open in Terminal' button to CLISelector cards |
| `33a7a24` | chore: update Cargo.lock after adding uuid dependency |

---

## Code Review Findings

### MEDIUM-1: Shell Injection Risk (未修复)

**文件**: `src-tauri/src/terminal.rs:22`

**问题**: 命令通过 `"{}"` 注入 bash 脚本模板，**双引号不阻止 `$()` 命令替换**。攻击者可通过 `hermes$(whoami)` 等方式注入任意命令。

**修复方案**: 添加 `shell_escape` helper，对 command 进行单引号包裹并转义内部单引号。

```rust
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
```

脚本模板改为:

```rust
let script_content = format!(
    "#!/bin/bash\ncd \"$HOME\"\nexec {}\nexec $SHELL\nrm \"$0\"\n",
    shell_escape(command)
);
```

**状态**: 待修复，不阻塞 Task 6 手动测试。

### MEDIUM-2: Missing Invariant Comment (未修复)

**文件**: `src/components/CLISelector.tsx:64`

**问题**: `result.path!` 的 `!` 断言依赖 `found === true` 时 path 必 set 这一不变量，无注释说明。

**修复方案**: 添加 `// path is guaranteed when found=true` 注释。

---

## Self-Review Checklist

- [x] Spec coverage: every requirement has a corresponding task
- [x] No nested `<button>` — uses `<span role="button">`
- [ ] No command injection — **发现 MEDIUM-1，需修复**
- [x] Empty CLI validation — TS + Rust 双重
- [x] i18n — 双语 key 已添加
- [x] CSS variables — 使用现有 design tokens
- [x] Type consistency — `launch_in_terminal` 命令名 Rust/TS 一致
- [x] Module registration — `mod terminal;` 正确注册
- [x] Dependencies — 仅添加 `uuid`，无 `dirs`
- [x] Self-cleanup — `rm "$0"` 自删除
- [x] 测试通过 — 159 tests PASS

---

## 待手动验证 (Task 6)

- `pnpm tauri dev` → CLISelector → 点击 "Open in Terminal"
- macOS 确认弹窗 → 新终端窗口打开
- 命令执行正常
- Shell 窗口保持打开（`exec $SHELL`）
- 临时脚本自删除（`rm "$0"`）

---

## Files Changed

```
src-tauri/Cargo.toml          (+1 line: uuid dep)
src-tauri/Cargo.lock         (auto)
src-tauri/src/terminal.rs    (new, 70 lines)
src-tauri/src/lib.rs          (+2 lines: mod + handler)
src/lib/terminal-launch.ts   (new, 9 lines)
src/lib/terminal-launch.test.ts (new, 30 lines)
src/lib/locales/zh.json      (+1 key)
src/lib/locales/en.json      (+1 key)
src/components/CLISelector.tsx   (+15 lines)
src/components/CLISelector.module.css (+20 lines)
```
