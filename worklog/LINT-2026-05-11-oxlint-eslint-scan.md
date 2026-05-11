# Worklog: OxLint & ESLint 全面扫描

- **日期**: 2026-05-11
- **类型**: LINT
- **工具**: OxLint v1.63.0 + ESLint v9 (typescript-eslint / react-hooks / react-perf / jsx-a11y)
- **范围**: `src/` 全量扫描（排除 `node_modules/`, `src-tauri/`, `dist/`, `__mocks__/`）

---

## 1. OxLint 扫描

### 命令

```bash
npx oxlint@latest src/ \
  --react-plugin --react-perf-plugin --jsx-a11y-plugin \
  --import-plugin --vitest-plugin --promise-plugin \
  -W correctness -W suspicious -W pedantic -W perf -W style
```

### 结果

- **总诊断数**: 1938 条
- **Top 10 规则**:

| # | 规则 | 数量 | 严重性 | 备注 |
|---|------|------|--------|------|
| 1 | `react/react-in-jsx-scope` | 186 | 误报 | Preact 不需要 React in scope |
| 2 | `vitest/prefer-expect-assertions` | 130 | 风格 | 测试缺少 expect.assertions |
| 3 | `eslint/func-style` | 96 | 风格 | 建议函数表达式而非声明 |
| 4 | `eslint/sort-keys` | 79 | 风格 | 对象 key 排序 |
| 5 | `import/no-named-export` | 73 | 风格 | 不允许命名导出 |
| 6 | `eslint/id-length` | 70 | 风格 | 标识符过短 |
| 7 | `eslint/no-magic-numbers` | 48 | 风格 | 魔术数字 |
| 8 | `unicorn/no-null` | 48 | 风格 | 不允许 null |
| 9 | `import/group-exports` | 42 | 风格 | 合并导出声明 |
| 10 | `eslint/curly` | 38 | 风格 | if 后缺少花括号 |

### 分析

OxLint 启用了 `pedantic` + `style` 类别后，风格/偏好类规则占绝大多数（>90%）。其中 `react-in-jsx-scope` 的 186 条全部是 Preact 项目误报。真正有价值的诊断集中在 react-perf（36 条）和 promise 规则（22 条），与 ESLint 结果高度重叠。

---

## 2. ESLint 深度扫描

### 配置

- `eslint.config.js`（flat config，ESLint v9 格式）
- 插件: `typescript-eslint@8`, `react-hooks@5`, `react-perf@3`, `jsx-a11y@6`
- Preact 兼容: `jsxPragma: "h"`, `jsxFragmentName: "Fragment"`

### 命令

```bash
npx eslint src/ --format stylish
```

### 结果

- **总问题数**: 66 条（**2 errors + 64 warnings**）
- **1 error + 1 warning 可通过 `--fix` 自动修复**

#### Errors（必须修复）

| 文件 | 行号 | 规则 | 说明 |
|------|------|------|------|
| `src/components/TerminalView.tsx` | 8 | `no-control-regex` | 正则含控制字符 `\x1b`、`\x0d`（ANSI 转义序列解析） |
| `src/lib/debug-metrics.ts` | 25 | `prefer-const` | `globalState` 未重赋值，应为 `const` |

#### Warnings 按类别

| 类别 | 数量 | 分布 |
|------|------|------|
| `react-perf/jsx-no-new-function-as-prop` | 23 | App.tsx(3), ApprovalModal(2), ApprovalPanel(2), CLISelector(1), Settings(2), TabBar(3), Toast(1), ApprovalConfig(3), LanguageSelector(2), ThemeModeSelector(1), ApprovalModal.test(3) |
| `react-perf/jsx-no-new-array-as-prop` | 6 | TabBar.test(1), TerminalView.test(5) |
| `react-perf/jsx-no-new-object-as-prop` | 5 | DebugOverlay(3), TerminalView(1), ApprovalModal.test(2) |
| `@typescript-eslint/no-explicit-any` | 9 | TerminalView.test(4), use-terminal-fit.test(5) |
| `react-hooks/exhaustive-deps` | 5 | ApprovalPanel(3), TerminalView(1), use-terminal-fit(1), use-toast(1) |
| `prefer-const` (fixable) | 1 | debug-metrics.ts |
| 未用 eslint-disable 指令 | 1 | use-terminal-fit.test |

---

## 3. 交叉对比

| 维度 | OxLint | ESLint |
|------|--------|--------|
| 总诊断数 | 1938 | 66 |
| 误报率 | 高（Preact 不兼容 + 风格规则激进） | 低 |
| 可操作问题 | ~60（去重后与 ESLint 重叠） | 66（全部指向实际代码） |
| 性能问题覆盖 | 36 条 react-perf | 34 条 react-perf |
| Hooks 问题 | 未检测 | 5 条 exhaustive-deps |
| Preact 兼容 | 差（186 条误报） | 好（配置 jsxPragma 后无误报） |

---

## 4. 建议优先级

### P0 — 立即修复（2 errors）

1. `debug-metrics.ts:25` — `let` → `const`（`--fix` 可自动修）
2. `TerminalView.tsx:8` — `no-control-regex` 确认 ANSI 正则安全性（可能需要 `eslint-disable` 注释，因为这是终端解析必需的）

### P1 — 性能优化（34 条 react-perf）

- 内联函数/数组/对象作为 prop 导致不必要的子组件重渲染
- 高频组件优先：`TabBar`、`ApprovalPanel`、`TerminalView`

### P2 — Hooks 依赖（5 条 exhaustive-deps）

- `ApprovalPanel.tsx` — `requests.length` 依赖缺失 + ref cleanup 竞态
- `use-toast.ts` — ref cleanup 同样问题
- `use-terminal-fit.ts` — `scheduleFit` 依赖缺失

### P3 — 测试类型安全（9 条 no-explicit-any）

- `TerminalView.test.tsx` 和 `use-terminal-fit.test.ts` 中的 `any` 应替换为具体类型

---

## 5. 新增文件

- `eslint.config.js` — ESLint flat config，已针对 Preact 配置
- `package.json` — 新增 devDependencies: `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-perf`, `eslint-plugin-jsx-a11y`
