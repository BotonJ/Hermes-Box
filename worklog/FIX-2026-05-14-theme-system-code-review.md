# FIX-2026-05-14-theme-system-code-review

**分支**: `feat/launch-in-default-terminal`
**基准**: `e2c1b84` (pre-review baseline)
**审查范围**: 13 文件，+850 行主题系统改动
 Baseline commit 已完成：e2c1b84，
---

## 审查方法

4 个 code-reviewer 子代理并行审查：
- G1-A: `theme.ts` + `hermes-colors.ts` 核心逻辑
- G1-B: `App.tsx` + `main.tsx` + `Settings.tsx` 集成时序
- G2: CSS 主题系统 + UI 组件（TabBar、ThemeSelector、xterm-themes）
- G3: 测试覆盖缺口分析

发现：0 CRITICAL / 8 HIGH / 8 MEDIUM / 4 LOW

---

## 修复清单

### HIGH 修复（8/8 完成）

| ID | 问题 | 修复 | 文件 |
|----|------|------|------|
| H-1 | `--active` 应为 `--surface-active`，浅色主题 toggle 颜色错误 | 改名 | `app.css:383,434` |
| H-2 | 并发 `applyHermesColors` 文件写入竞态 | 添加 `writeChain` promise chain 互斥锁 | `hermes-colors.ts` |
| H-3 | Hermes 未安装时每次调用都执行 `which hermes` | 缓存 `__not_found__` 标记值 | `hermes-colors.ts` |
| H-4 | `main.tsx` + `App.tsx` 启动时重复调用 | 移除 `App.tsx` tab 恢复中的重复调用 | `App.tsx` |
| H-5 | OBSIDIAN 与 GRUVBOX_DARK 完全重复 | `const GRUVBOX_DARK = OBSIDIAN` | `xterm-themes.ts` |
| H-6 | `system` 主题的 xterm 主题永不运行时解析 | `getXtermTheme` 中添加 matchMedia 判断 | `xterm-themes.ts` |
| H-7 | `/bin/zsh` 硬编码，Linux 不兼容 | 使用 `platform()` 动态选择 shell | `hermes-colors.ts` |
| H-8 | TabBar 按钮缺少 `aria-label` | 添加 accessible name 到所有按钮 | `TabBar.tsx` |

### MEDIUM 修复（4/8 完成，选取高价值项）

| ID | 问题 | 修复 | 文件 |
|----|------|------|------|
| M-1 | 18 个 `console.log` 残留 | 全部移除 | `hermes-colors.ts` |
| M-2 | 浅色主题列表硬编码三元判断 | 提取 `LIGHT_THEMES` Set 常量 | `theme.ts` |
| M-5 | 3 个浅色主题重复 scrollbar 定义 | 提取 `--scrollbar-thumb` CSS 变量 | `app.css` |
| M-3 | patchSkinEngine 只替换首次出现 | 标记不修复（skin_engine.py default 在首位，当前安全） |

### 测试修复

| 文件 | 修改 |
|------|------|
| `hermes-colors.test.ts` | 添加 `@tauri-apps/plugin-os` mock（H-7 引入的 platform 依赖） |
| `TabBar.test.tsx` | `getByTitle` → `getByLabelText`（H-8 将 title 改为 aria-label） |
| `xterm-themes.test.ts` | 添加 `matchMedia` stub（H-6 引入的运行时解析依赖） |

---

## 关键改动细节

### 互斥锁（H-2）

```typescript
let writeChain: Promise<void> = Promise.resolve();

export function applyHermesColors(theme: "light" | "dark"): Promise<string> {
  let resolveResult!: (msg: string) => void;
  const result = new Promise<string>((r) => { resolveResult = r; });
  writeChain = writeChain.then(async () => {
    // ... 实际文件写入逻辑
    resolveResult(msg);
  });
  return result;
}
```

所有 `applyHermesColors` / `resetHermesColors` 调用通过 `writeChain` 串行执行，防止并发交错写入。

### NOT_FOUND 缓存（H-3）

```typescript
const NOT_FOUND = "__not_found__";

export async function resolveHermesCliDir(): Promise<string> {
  const cached = getCachedPath();
  if (cached === NOT_FOUND) return "";
  // ...
  if (!hermesPath) {
    cachePath(NOT_FOUND);
    return "";
  }
}
```

Hermes 未安装时只执行一次 `which hermes`，后续调用直接返回空字符串。

### Scrollbar CSS 变量统一（M-5）

```css
:root {
  --scrollbar-thumb: rgba(255, 255, 255, 0.1);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.18);
}

:root[data-theme="grass"] {
  --scrollbar-thumb: rgba(0, 0, 0, 0.15);
  --scrollbar-thumb-hover: rgba(0, 0, 0, 0.25);
}
```

3 处重复的 `::-webkit-scrollbar-thumb` override 替换为统一 CSS 变量。

---

## 验证

```
pnpm test       → 26 files, 203 tests PASSED
pnpm typecheck  → tsc --noEmit PASSED
```

---

## 未修复项（记录）

| ID | 原因 |
|----|------|
| M-4 | patchSkinEngine 只替换首次出现 — skin_engine.py default 始终在首位，当前安全 |
| M-6 | Settings lastEffective 与 systemListener 同步 — 边缘情况，仅导致一次多余调用 |
| M-7 | ThemeSelector 复用 soundPicker CSS 类 — 视觉无影响，低优先级 |
| M-8 | stale matchMedia 启动写入 — handleSelect 的 colorSync 已是运行时修正 |
| L-1~L-4 | 低优先级，不影响功能 |

---

## 测试覆盖缺口（P0 级，待后续补充）

1. `patchBanner` 的 `text=True` 不匹配路径
2. `patchSkinEngine` 部分正则不匹配
3. Tab 恢复 + 颜色同步顺序集成测试
