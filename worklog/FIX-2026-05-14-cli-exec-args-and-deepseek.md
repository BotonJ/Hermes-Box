# FIX 2026-05-14 — CLI execArgs + DeepSeek TUI 注册

**分支**：`fix/window-scroll-and-tab-shortcuts`

---

## 问题

1. **OpenClaw 卡片无法进入 TUI**：`openclaw` 无参数只打印 help 退出，需要 `openclaw tui` 才能进入 TUI。HermesBox 的 PTY 直接 `exec openclaw`，导致终端一闪而过。
2. **自定义 CLI 无法处理带参数命令**：用户填 `openclaw tui` 时，`commands: ["openclaw tui"]` 导致 `which "openclaw tui"` 返回 null，永远检测不到。
3. **DeepSeek TUI 未注册**：npm 包名 `deepseek-tui`，bin 别名 `deepseek` + `deepseek-tui`，未在 HermesBox 中注册。

## 修复

### `CLIMeta` 新增 `execArgs` 字段

```typescript
export interface CLIMeta {
  // ...
  execArgs?: string;  // PTY spawn 时追加的参数，如 "tui"
}
```

检测（`which`）只用 `commands[0]`（纯命令名），spawn 时如果有 `execArgs` 则拼到路径后面。

### 改动清单

| 文件 | 改动 |
|------|------|
| `src/lib/cli-detect.ts` | `CLIMeta` 新增 `execArgs`；OpenClaw 配 `"tui"`；新增 DeepSeek 注册（双命令） |
| `src/App.tsx` | `handleSelect` 拼 `execArgs` 到 spawn 命令 |
| `src/lib/custom-clis.ts` | `CustomCLI` 新增 `args` 字段；`addCustomCLI` 规范化空字符串；`customCLIsToMeta` 传递 `execArgs` |
| `src/components/settings/CustomCLIManager.tsx` | 新增 args 输入框 |
| `src/lib/locales/en.json` / `zh.json` | 新增 `cliArgsPlaceholder` |
| `src/lib/cli-icons.ts` | 新增 DeepSeek 图标 |
| `public/icons/deepseek-color.png` | DeepSeek 图标（来自 DeepSeek-TUI 源码 SVG 转换） |

### 测试

- 209 tests passed（新增 6 个测试）
- `pnpm typecheck` 通过

## 未处理

- Codex / OpenCode 未安装，无法验证启动方式，暂不修改
