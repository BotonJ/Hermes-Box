# P1 Bridge 部署路径修复 + 审批音效 Batch 1

**日期**：2026-05-11
**类型**：fix + feat
**测试**：Rust 40 passing, Frontend 137 passing

---

## P1：Bridge 脚本 auto-setup 路径修复

**问题**：`auto_setup_bridge()` 的候选路径只有 `current_dir()` 和 `current_exe()/../../bridge`，都不可靠。CWD 在 Tauri dev 模式下不稳定，exe 相对路径在打包后指向错误位置。

**修复**：
- 提取 `resource_dir_candidates(app: &AppHandle)` 获取 Tauri resource 路径 + `CARGO_MANIFEST_DIR`
- 拆分 `generate_approval_config` 为纯函数 `inner` + tauri command 壳，测试不依赖 AppHandle
- 候选搜索顺序：extra_candidates → CWD → exe parent

**新增测试**：
- `auto_setup_copies_scripts_from_extra_candidate` — 验证从传入候选路径复制脚本
- `auto_setup_fails_with_no_candidates` — 验证无候选时正确报错
- `generate_config_auto_deploys_bridge_from_candidates` — 端到端验证配置生成 + 自动部署

**文件**：
- `src-tauri/src/approval.rs`（核心修改）

---

## 审批音效 Batch 1：开关 + 系统音效

**功能**：
- Settings 页面新增"审批音效"开关
- 开启后收到审批请求时播放 macOS 系统音效（Claude: Ping, Hermes: Glass）
- 开关状态持久化到 localStorage

**文件**：
- `src/lib/sound.ts`（新增 — 音效工具 + 开关状态）
- `src/lib/sound.test.ts`（新增 — 4 tests）
- `src/App.tsx`（接入 playApprovalSound）
- `src/components/Settings.tsx`（添加 toggle section）
- `src/lib/locales/en.json`、`zh.json`（添加翻译）

---

## 后续

- Batch 2：自定义音效选择（系统音效列表 + 自定义文件路径）
- P2 浅色主题
- P3 CLI 界面增强
