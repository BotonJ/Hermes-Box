# FEAT 2026-05-13 — Hermes Colors Settings Button

**分支**：`feat/launch-in-default-terminal`
**状态**：代码完成（194 tests / typecheck 通过），**按钮未生效待修**

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

---

## 已知问题：按钮不生效

### 根因

`getHermesCliPath()` 只读 `localStorage.getItem("hermesbox:hermes-cli-path")`，但**没有任何代码向 localStorage 写入该 key**。

HANDOFF 文档描述的 `resolveHermesCliDir()` 三层 fallback **从未被实现**：

1. **shebang 解析**：读 `~/.local/bin/hermes` 的 shebang → 提取安装目录 → 拼 `hermes_cli/`
   - 验证：shebang 为 `#!/Users/dor/Downloads/Installers/hermes-agent-2026.4.23/venv/bin/python`
   - 期望路径：`/Users/dor/Downloads/Installers/hermes-agent-2026.4.23/hermes_cli/`
2. **Downloads 扫描**：`~/Downloads/Installers/hermes-agent-*/hermes_cli/`（按版本倒序）
   - 验证：3 个版本目录均存在 `skin_engine.py`
3. **localStorage 缓存**：之前成功发现的路径（兜底）

### 影响

`getHermesCliPath()` 返回空字符串 → `patchBanner()` 和 `patchSkinEngine()` 直接 return → 写入操作被跳过 → 按钮看起来无效果。

### 修复计划（待讨论）

1. 在 `hermes-colors.ts` 中实现 `resolveHermesCliDir()`，含上述三层 fallback
2. 需要读取本地文件（shebang），依赖 `@tauri-apps/plugin-fs` 的 `readTextFile`
3. 成功发现路径后写入 `localStorage` 缓存
4. `getHermesCliPath()` 改为优先调 `resolveHermesCliDir()`，或在组件初始化时调一次
5. **同步 vs 异步问题**：`getHermesCliPathStatus()` 当前是同步函数，路径发现需要异步读文件，需要重构为 `useState + useEffect` 模式

### 待办（用户提出，未实施）

- 按钮 i18n 文案修改：
  - "应用配色" → "为Hermes文字适配浅色主题"
  - "重置" → "重置Hermes文字颜色"
- 需同步更新 `en.json` 对应英文
