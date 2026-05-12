# FIX-2026-05-13 — G1/G2/G3 Code Review 修复

**日期**：2026-05-13
**分支**：`feat/launch-in-default-terminal`
**基准**：G1/G2/G3 三组审查结果
**测试**：前端 177 tests PASS + Rust 52 tests PASS + typecheck PASS

---

## 修复清单

### P0 — 一行修复

| ID | 文件 | 变更 |
|----|------|------|
| G3-C001 | `src-tauri/src/terminal.rs:60` | `0o755` → `0o700`，防止 .command 文件（含 CLI 命令）世界可读 |
| G2-C001 | `src/components/settings/SoundSelector.tsx:59` | 移除 `console.log("[SoundPicker] preview ...")` 调试日志 |
| G3-M-001 | `src/components/CLISelector.tsx:64` | `console.error` → `console.error("[terminal-launch]", err)` 加标签 |

### P1 — 核心修复

| ID | 文件 | 变更 |
|----|------|------|
| G3-H-001 | `src-tauri/src/terminal.rs` | 脚本加入 `trap 'rm -f "$0"' EXIT` 自删除；新增 `cleanup_stale_scripts()` 清理 24h+ 旧 .command 文件 |
| G1-H-002 | `src/lib/hermes-colors.ts` | 硬编码路径改为 `localStorage("hermesbox:hermes-cli-path")`；无配置时静默跳过；正则替换后校验 `content !== original` 再写入 |
| G2-H-003 | `src-tauri/src/window.rs` | 新增 `clamp_position()` 函数；`load_position_from_disk` 对超限值 clamp 而非直接拒绝（解决 MAX_DIM 10000→4000 迁移问题） |

### 测试补充

| 文件 | 新增 tests | 覆盖内容 |
|------|-----------|----------|
| `src/lib/hermes-colors.test.ts` | 6 | 空路径跳过 / 配置路径读写 / regex 无匹配不写 / IO 失败静默 / localStorage 失败 |
| `src/lib/cli-icons.test.ts` | 3 | 映射完整性 / 路径格式 / ID 集合 |
| `src/components/settings/ThemeSelector.test.tsx` | 3 | 渲染所有 preset / 当前选中 / onChange 回调 |
| `src/lib/sound.test.ts`（扩展） | 7 | custom path 存取 / playSoundById invoke 路径 + fallback / playApprovalSound 禁用时不调用 |
| `src-tauri/src/window.rs`（Rust） | 4 | clamp 超限 / clamp 低于 MIN 拒绝 / clamp 坐标 / clamp 有效值不变 |

---

## 变更统计

```
修改文件：
  src-tauri/src/terminal.rs       (+28, -1)
  src-tauri/src/window.rs         (+40, -4)
  src/lib/hermes-colors.ts        (+40, -17)
  src/components/CLISelector.tsx  (+2, -1)
  src/components/settings/SoundSelector.tsx (-1)
  src/lib/sound.test.ts           (+47)

新增文件：
  src/lib/hermes-colors.test.ts   (+74)
  src/lib/cli-icons.test.ts       (+27)
  src/components/settings/ThemeSelector.test.tsx (+47)
```

---

## 未修复项（P2，不阻塞合并）

| ID | 说明 |
|----|------|
| G1-C-003 | `hermes-agent-light.png` 47KB 偏大，建议后续优化为 SVG |
| G1-H-001 | `xterm-themes.ts` 242 行接近上限，可考虑拆分 |
| G1-H-003 | `app.css` 479 行超标，可拆分为 tokens/themes/global |
| G1-H-005 | `TabBar.tsx` 动态内联样式每渲染创建新对象 |
| G2-M-001 | `approval.rs` 路径遍历检查缺少注释 |
| G2-M-002 | `play_sound` 仅支持 macOS |
