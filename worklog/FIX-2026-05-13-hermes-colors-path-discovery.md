# FIX 2026-05-13 — Hermes Colors 按钮不生效 + 文案修改

**分支**：`feat/launch-in-default-terminal`
**状态**：完成，194 tests 全绿，typecheck 通过

---

## 根因

`getHermesCliPath()` 只读 `localStorage`，但无代码写入该 key → 路径为空 → patch 被跳过。

## 修复

### 路径发现

替换整个路径机制为 shebang 解析：

1. 读 `~/.local/bin/hermes` 第一行 shebang
2. 正则提取 `/(.*?)/venv/bin/python` → 拼接 `hermes_cli/`
3. 缓存到 localStorage，后续直接命中缓存

移除了旧的三层 fallback 设计（太复杂）和 `patchBanner()` 函数（当前版本 banner.py 用 `_skin_color()` 从 skin_engine 读取，不需要单独改）。

### 只改 skin_engine.py

`banner_text` 和 `prompt` 两个 key，正则替换第一个匹配（只改 default skin）。

### 按钮文案

| 语言 | Apply | Reset |
|------|-------|-------|
| zh | 为Hermes文字适配浅色主题 | 重置Hermes文字颜色 |
| en | Adapt for Light Theme | Reset Hermes Colors |

## 改动文件

| 文件 | 变更 |
|------|------|
| `src/lib/hermes-colors.ts` | 重写：`resolveHermesCliDir()` shebang 解析 + localStorage 缓存，移除 `patchBanner()` |
| `src/lib/hermes-colors.test.ts` | 重写：15 个测试覆盖路径发现 + patch + reset |
| `src/components/settings/HermesColors.tsx` | 异步路径发现（`useState + useEffect`），移除同步 `getHermesCliPathStatus` |
| `src/components/settings/HermesColors.test.tsx` | 重写：7 个测试全部用 `waitFor` 处理异步 |
| `src/lib/locales/en.json` | 按钮文案更新 |
| `src/lib/locales/zh.json` | 按钮文案更新 |

## 验证

- 测试脚本 `scripts/test-hermes-colors.sh` 验证 shebang 解析、正则替换均正确
- 手动 patch skin_engine.py + 启动 hermes 确认浅色主题下文字可读
- 194 tests passed, TypeScript 零错误
