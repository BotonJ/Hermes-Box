# tauri-pty 插件缺陷分析报告

**日期**：2026-05-09
**分支**：v2-rebuild
**插件版本**：tauri-pty v0.2.1 (JS) / tauri-plugin-pty v0.2.1 (Rust)
**上游仓库**：https://github.com/Tnze/tauri-plugin-pty

---

## 问题现象

5 个 Tab 打开后终端无输出。之前的 C2-C5 修复（Preact 生命周期边界 case）和 P0 报告中的 Canvas 渲染器修复（xterm.js v5 默认已是 Canvas）均未触及根因。

---

## 根因分析

### JS 层缺陷（tauri-pty v0.2.1，161 行）

#### BUG-1: `dispose()` 未实现

```javascript
// node_modules/tauri-pty/dist/index.es.js line 97-99
dispose() {
    throw new Error("Method not implemented.");
}
```

**影响**：无法清理 JS 端资源。调用即崩溃。

#### BUG-2: `readData()` 无限循环无退出机制

```javascript
// line 126-141
async readData() {
    await this._init;
    try {
        for (;;) {                              // 永不退出
            const data = await invoke('plugin:pty|read', { pid: this.pid });
            this._onData.fire(data);
        }
    } catch (e) {
        if (typeof e === 'string' && e.includes('EOF')) return;  // 唯一退出条件
        console.error('Reading error: ', e);
    }
}
```

**影响**：`kill()` 后循环仍在运行，等待下一个 `read` IPC 返回。每个关闭的 Tab 泄漏一个异步循环。

#### BUG-3: `kill()` fire-and-forget

```javascript
// line 117-119
kill(signal) {
    this._init.then(() => invoke('plugin:pty|kill', { pid: this.pid }));
    // 不 await、不清理、不设置任何状态
}
```

**影响**：调用后立即返回，无法确认子进程是否已终止，无法清理关联资源。

---

### Rust 层缺陷（tauri-plugin-pty v0.2.1，217 行）

#### BUG-4: `kill()` 不移除 session

```rust
// lib.rs line 168-184
async fn kill(pid: PtyHandler, state: tauri::State<'_, PluginState>) -> Result<(), String> {
    let session = state.sessions.read().await.get(&pid)...;
    session.child_killer.lock().await.kill()...;
    // Session 对象（PtyPair、reader、writer、fd）永远留在 BTreeMap 中
    Ok(())
}
```

**影响**：每个关闭的 Tab 泄漏一个 Session。包含文件描述符、reader/writer、PtyPair。

#### BUG-5: 无 `destroy` 命令

```rust
// init() 注册的命令列表
.invoke_handler(tauri::generate_handler![
    spawn, write, read, resize, kill, exitstatus
    // 没有 destroy
])
```

**影响**：JS 端无法通知 Rust 端释放 session。唯一的清理路径是进程退出。

---

## 资源泄漏链路

```
Tab 关闭
  → pty.kill()（fire-and-forget，不 await）
  → term.dispose()（立即执行）
  → Rust: child_killer.kill() 只杀子进程，session 保留在 BTreeMap
  → JS: readData() 无限循环仍在运行（等待 read IPC 返回）
  → Rust: read() 阻塞在 session.reader 上（子进程已死，但 reader 未关闭）
  → 每关闭一个 Tab：泄漏 1 个 Session + 1 个 JS 异步循环 + 若干 FD
  → 5 个 Tab 后：5 个泄漏实例累积
  → 新 Tab 的 IPC 调用阻塞或失败 → 无输出
```

---

## 修复方案对比

### 方案 A: Patch tauri-pty

**做法**：fork 仓库，修补 JS + Rust 两端缺陷。

**改动清单**：

| 层 | 改动 | 行数 |
|----|------|------|
| Rust | 新增 `destroy` 命令：`sessions.write().await.remove(&pid)` | ~10 行 |
| JS | `dispose()` 调用 `invoke('plugin:pty|destroy')` | ~3 行 |
| JS | `kill()` 改 `await invoke(...)` | ~1 行 |
| JS | `readData()` 加 `this._stopped` 标志，每次循环检查 | ~3 行 |

**总改动**：~17 行

**优点**：改动量最小，直接修复全部 5 个 bug，风险低

**缺点**：
- 需要维护 fork（上游 Tnze/tauri-plugin-pty 不活跃）
- Rust 端需要 `[patch.crates-io]` 或发布到私有 registry
- npm 端需要 `patch-package` 或发布私有包

**工作量**：2-4 小时

---

### 方案 B: node-pty + Tauri shell

**不可行**。Tauri v2 WebView 无 Node.js 运行时。node-pty 是 C++ native addon，无法在 Tauri 进程中使用。需额外起 Node 子进程做代理，架构复杂且无收益。

**排除。**

---

### 方案 C: 自写 Rust PTY 插件

**做法**：基于 `portable-pty` crate（tauri-plugin-pty 本身就是用它写的）从头实现 Tauri 插件。

**改动清单**：

| 部分 | 内容 | 行数 |
|------|------|------|
| Rust | spawn/write/read/resize/destroy 五个命令 + 正确 cleanup | ~200 行 |
| JS | TauriPty class（dispose/kill/readData 全部正确实现） | ~150 行 |
| 注册 | plugin init + invoke handler | ~20 行 |

**总改动**：~370 行

**优点**：
- 完全可控，无上游依赖
- 从设计阶段就内建 cleanup 机制
- 可按需扩展（read 取消、session 恢复等）

**缺点**：
- 工作量最大
- 需要全面测试（跨平台 PTY 行为差异）
- portable-pty v0.9.0 本身也需要验证

**工作量**：1-2 天

---

## 建议

| 维度 | 方案 A | 方案 C |
|------|--------|--------|
| 可行性 | ✅ | ✅ |
| 改动量 | ~17 行 | ~370 行 |
| 工作量 | 2-4 小时 | 1-2 天 |
| 风险 | 低 | 中 |
| 维护成本 | fork 维护 | 自主维护 |
| 根因修复 | 全部 5 个 bug | 全部 5 个 bug |

**推荐方案 A**。理由：
1. 改动量极小（~17 行），风险可控
2. 根因明确，修复路径清晰
3. 如果后续需要，可以平滑迁移到方案 C（底层都是 portable-pty）

**方案 B 排除**。架构不可行。

---

## 附录：上游状态

| 指标 | 值 |
|------|-----|
| GitHub | Tnze/tauri-plugin-pty |
| npm 最新版 | 0.2.1 |
| crates.io 最新版 | 0.2.1 |
| Rust 代码量 | 217 行 |
| JS 代码量 | 161 行 |
| 底层依赖 | portable-pty v0.9.0（wezterm 作者维护） |

---

*报告生成时间：2026-05-09*
