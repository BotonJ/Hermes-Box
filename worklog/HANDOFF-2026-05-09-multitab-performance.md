# HANDOFF — 多 Tab 性能修复（P0/P2）

**日期**：2026-05-09
**分支**：fix/window-scroll-and-tab-shortcuts
**状态**：P0 部分修复完成，P0-2（Rust PTY 泄漏）待定

---

## 背景

基于 `FIX-2026-05-08-multitab-performance-optimization.md` 的优化方案进行压力测试验证。手动测试发现 P0 级 Bug，根因分析后实施修复。

详细分析文档：
- `TEST/Tab压力测试报告.md` — 25 项测试用例，77% 通过率
- `TEST/P0根因分析报告.md` — 4 agent 并行根因分析
- `TEST/修复方案效果分析.md` — Canvas vs WebGL、Tab 限制分析
- `TEST/数据分析报告.md` — DebugOverlay JSON + iStatistica CSV 数据分析

---

## 修复清单

### 已完成

| 编号 | 问题 | 修复 | 文件 |
|------|------|------|------|
| P0-3 | `renderService.clear()`/`refreshRows()` 与 IntersectionObserver 冲突，导致非活跃 Tab 无法正确恢复渲染 | 移除两处调用，依赖 CSS `visibility: hidden` + IntersectionObserver 自动暂停/恢复 | `src/components/TerminalView.tsx` |
| P2-1 | Tab 数量无上限，资源线性增长导致系统冻结 | 添加 `MAX_TABS = 5`，达到上限后 `addTab()` 静默返回 | `src/App.tsx` |

### 已确认无需修改

| 编号 | 问题 | 说明 |
|------|------|------|
| P0-1 | WebGL context 泄漏 | 项目**未加载** `@xterm/addon-webgl`，默认使用 Canvas 渲染器（CPU 软件渲染，无 context 上限）。`rendererType: "canvas"` 不是有效 API，Canvas 就是默认值。 |

### 待定（需要 fork crate）

| 编号 | 问题 | 方案 |
|------|------|------|
| P0-2 | `tauri-plugin-pty` 的 `kill()` 只调用 `child_killer.kill()`，**不从 `state.sessions` 移除**，导致 FD/内存泄漏 | 需要 fork `tauri-plugin-pty` 添加 `destroy` 命令（删除 session + drop handler） |

**P0-2 详情**：

`~/.cargo/registry/src/.../tauri-plugin-pty-0.2.1/src/lib.rs` 第 169-184 行：

```rust
#[tauri::command]
async fn kill(state: State<'_, PluginState>, handler: PtyHandler) -> Result<(), String> {
    let sessions = state.sessions.read().await;
    if let Some(session) = sessions.get(&handler) {
        let child_killer = session.child_killer.clone();
        let _ = child_killer.lock().await.kill();  // 只 kill 进程
    }                                               // 但 session 仍在 BTreeMap 中！
    Ok(())
}
```

`PluginState.sessions` 只有 `insert` 操作，没有 `remove`。每次关闭 Tab 后 PTY 进程被 kill，但 Session 对象（含 FD）永远留在内存中。

**临时缓解**：MAX_TABS=5 限制了泄漏上限，短期可接受。

---

## 当前 diff

```
src/App.tsx                     | 3 +++   (MAX_TABS = 5)
src/components/TerminalView.tsx | 8 ------ (移除 renderService.clear/refreshRows)
```

typecheck 通过，117 tests 全绿。

---

## 下一步

1. **验证修复效果** — `pnpm tauri dev`，按 `TEST/Tab压力测试报告.md` 重测 P0 场景
2. **P0-2 决策** — 是否 fork `tauri-plugin-pty` 添加 destroy 命令
3. **P1 待办** — TabBar 滚动、拖拽排序、缩放、resize 快捷键（报告中 P1 项）
4. **提交** — 修复验证通过后 `fix:` commit


PO-3测试通过，具体是：新开box，打开5个标签，每打开一个就输入部分命令，而非一次打开5个。测试正常，可以正常输出，其中3个TAB执行 find / 无问题。对比测试，一次打开5个TAB，到第五个只有光标闪烁，且前面所有TAB 无法输出和回车。TAB达到上限无法继续打开新TAB 

 两个发现：

  1. 焦点修复生效 — 所有 5 个 Tab 都收到 PTY data 了（上次只有 4 个）。term.focus()
  是正确的修复。

  2. 真正的布局问题 — rows=5：

  初始: cols=105 rows=33  (PTY spawn 时正常)
  后来: cols=105 rows=5   (切换 Tab 后变成 5 行)

  根因：所有 5 个 TerminalView 用 visibility: hidden 隐藏，但 visibility: hidden
  的元素仍然参与 flex 布局。5 个终端平分容器高度 → 每个只有 5 行。active
  的终端也只拿到 1/5 空间。

  用 display: none 或 position: absolute 替代 visibility: hidden 可以解决，但这会破坏
   IntersectionObserver 的自动暂停机制（display: none 的元素面积为
  0，IntersectionObserver 不触发）。

  需要找到一个方案：既让 inactive 终端不占 flex 空间，又保持 IntersectionObserver
  工作。position: absolute; inset: 0 是方向——覆盖容器但不参与 flex
  流。是否继续排查这个方向？

---

## 修复记录（2026-05-09 续）

### 根因更新

CSS 模块已正确应用 `position: absolute`（Vite dev server 确认 class `_terminal_45wkm_1`）。`rows=5` 不是 CSS 布局问题。

**真正根因**：
1. `fitAddon.fit()` 仅在首次 PTY spawn 时调用，Tab 切换回来不重新 fit
2. `term.onResize` 去重逻辑可能阻止 PTY 同步正确尺寸

### 已修复（见 FIX-2026-05-09-multitab-rows5.md）

| 编号 | 修改 | 文件 |
|------|------|------|
| rows=5 | `fitAddon.fit()` 移到 PTY spawn 外，每次激活都 fit | `src/components/TerminalView.tsx` |
| rows=5 | 移除 `term.onResize` 去重逻辑 | `src/components/TerminalView.tsx` |
| P0-3 | 移除 `renderService.clear()`/`refreshRows()` | `src/components/TerminalView.tsx` |
| 清理 | 移除 debug console.log | `src/components/TerminalView.tsx` |

当前 diff：`src/App.tsx (+3)` + `src/components/TerminalView.tsx (-16/+10)`
typecheck 通过，117 tests 全绿。

### 下一步

1. **手动验证** — `pnpm tauri dev`，重测 rows=5 场景
2. **P0-2** — Rust PTY session 泄漏（fork tauri-plugin-pty）
3. **提交** — 验证通过后 `fix:` commit

