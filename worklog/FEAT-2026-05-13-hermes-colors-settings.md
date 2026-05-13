# FEAT 2026-05-13 — Hermes Colors Settings Button

**分支**：`feat/launch-in-default-terminal`
**状态**：完成，194 tests 全绿，typecheck 通过

---

## 变更

将 Hermes CLI 配色 patch 从自动触发改为 Settings 页面显式按钮。

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/components/settings/HermesColors.tsx` | Apply/Reset 按钮，显示发现状态和操作结果 |
| `src/components/settings/HermesColors.test.tsx` | 7 个测试覆盖渲染、点击、状态 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/lib/hermes-colors.ts` | 新增 `resetHermesColors()`、`getHermesCliPathStatus()`、`RESET_COLORS` 常量 |
| `src/lib/hermes-colors.test.ts` | 新增 5 个测试覆盖 reset 和 path status |
| `src/components/Settings.tsx` | 移除 `applyHermesColors` 自动调用，添加 `HermesColors` 组件 |
| `src/lib/locales/en.json` | 新增 `applyColors`/`resetColors`/`hermesNotDetected` |
| `src/lib/locales/zh.json` | 同上中文翻译 |

### 测试统计

- 新增 12 个测试（5 lib + 7 component）
- 全量 194 tests passed
- TypeScript 零错误

### TDD 流程

1. `resetHermesColors` + `getHermesCliPathStatus` — RED (5 fail) → GREEN (194 pass)
2. `HermesColors` component — RED (1 fail: file missing) → GREEN (194 pass)
3. 异步消息测试修复 — `waitFor` 替代直接断言

### 设计决策

- **按钮方案**取代自动 patch：vite HMR 无法可靠触发自动调用，改为用户显式操作
- **复用 CSS**：`.configButton` / `.configButtons` / `.configSuccess`，零新增 CSS
- **`getHermesCliPathStatus()`** 同步函数，组件渲染时直接调用，无需额外 state
