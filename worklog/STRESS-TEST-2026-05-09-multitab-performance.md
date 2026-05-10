# 多 Tab 性能压力测试报告

**日期**：2026-05-09
**分支**：fix/window-scroll-and-tab-shortcuts
**基线**：117 tests passed（新增 debug-metrics.test.ts）

---

## 测试目标

验证 FIX-2026-05-08-multitab-performance-optimization 的边界条件和稳定性。

---

## 代码审查发现

### 1. PTY 延迟 Spawn 逻辑（TerminalView.tsx:126-233）

**关键路径**：
- mount 时只创建 xterm 实例，不 spawn PTY
- PTY 在首次 `isActive=true` 时才 spawn
- 后续 isActive 切换：暂停/恢复渲染器 + flush 缓冲数据

**边界条件审查**：

| 场景 | 风险 | 代码位置 | 状态 |
|------|------|----------|------|
| 快速切换 Tab（<100ms） | PTY 未 ready 时收到数据 | :171-177 pendingWrites | ✅ 已处理 |
| 10+ Tab 同时 mount | 内存压力（每个 xterm ~10MB） | :69-97 Terminal 初始化 | ⚠️ 需测试 |
| 非活跃 Tab 收到大量数据 | 缓冲区溢出 | :154 MAX_PENDING=512KB | ✅ FIFO 丢弃 |
| PTY 进程崩溃 | onExit 回调 | :195-198 | ✅ 已处理 |
| 容器尺寸为 0 时 fit | 异常捕获 | :136 try/catch | ✅ 已处理 |

### 2. 缓冲区管理（TerminalView.tsx:154-169）

**FIFO 丢弃逻辑**：
```typescript
const MAX_PENDING = 512 * 1024; // 512KB
while (buf.bytes > MAX_PENDING && buf.chunks.length > 1) {
  buf.bytes -= buf.chunks.shift()!.length;
}
```

**问题**：
- 当 `buf.chunks.length === 1` 时，即使超过 512KB 也不会丢弃
- 单个超大 chunk（如 1MB）会保留完整，可能导致内存峰值

**建议**：
- 增加单 chunk 大小限制（如 256KB）
- 或在 `buf.chunks.length === 1` 时截断 chunk

### 3. 渲染器暂停/恢复（TerminalView.tsx:221-232）

**实现**：
```typescript
const renderService = (term as any)._core?._renderService;
if (renderService) {
  renderService.clear();      // 暂停
  renderService.refreshRows(0, term.rows - 1);  // 恢复
}
```

**风险**：
- 使用 xterm.js 内部 API（`_core._renderService`），版本升级可能破坏
- `refreshRows` 参数范围固定为 `0..rows-1`，如 rows 变化可能不完整

### 4. DebugOverlay 指标（debug-metrics.ts:45-55）

**字节率计算**：
```typescript
const elapsed = now - windowStart;
if (elapsed >= 1000) {
  const bps = (windowBytes / elapsed) * 1000;
  windowBytes = 0;
  windowStart = now;
  onUpdate(bps, totalBytes);
}
```

**问题**：
- `elapsed` 可能远大于 1000ms（如系统休眠后），导致 bps 计算失真
- 建议限制 `elapsed` 最大值为 2000ms

---

## 压力测试用例清单

### 测试组 A — Tab 数量边界（10+ Tab）

| ID | 操作 | 预期 | 风险点 |
|----|------|------|--------|
| A1 | 创建 10 个 Tab | 全部创建成功，UI 响应正常 | 内存压力 |
| A2 | 创建 10 个 Tab 后全部关闭 | 返回 Selector，无内存泄漏 | cleanup 逻辑 |
| A3 | 创建 15 个 Tab | TabBar 可横向滚动 | overflow 处理 |
| A4 | 创建 10 个 Tab，全部激活后切换 | 切换延迟 < 100ms | PTY 进程数 |
| A5 | 创建 10 个 Tab，只激活 1 个 | 其他 9 个不 spawn PTY | 延迟 spawn |

### 测试组 B — 快速切换场景

| ID | 操作 | 预期 | 风险点 |
|----|------|------|--------|
| B1 | 快速切换 Tab（<100ms 间隔） | 无崩溃，最终状态正确 | PTY 未 ready |
| B2 | 快速切换 + 输入字符 | 字符不丢失 | pendingWrites flush |
| B3 | 快速切换 + resize | 尺寸正确同步 | onResize 竞态 |
| B4 | Cmd+1/2/3 快速连按 | 切换正确 | 快捷键防抖 |
| B5 | Cmd+Shift+[/] 快速连按 | 切换正确 | 索引边界 |

### 测试组 C — 长时间运行

| ID | 操作 | 预期 | 风险点 |
|----|------|------|--------|
| C1 | 单 Tab 运行 `yes` 命令 60 秒 | 可 Ctrl+C 中断，UI 不卡 | bytesPerSec 持续更新 |
| C2 | 5 Tab 各运行 `find /` | 全部可操作，无冻结 | PTY 进程竞争 |
| C3 | 5 Tab 空闲 10 分钟 | 内存稳定，无泄漏 | 定时器清理 |
| C4 | 非活跃 Tab 产生 1MB+ 输出 | 切换回时正常 flush | 缓冲区 512KB 限制 |
| C5 | 系统休眠后恢复 | Tab 状态正确 | 字节率计算 |

### 测试组 D — bufferLines 指标

| ID | 操作 | 预期 | 风险点 |
|----|------|------|--------|
| D1 | 打开 DebugOverlay（Ctrl+Shift+D） | 显示所有 Tab 指标 | 挂载逻辑 |
| D2 | 运行 `ls -la` | bufferLines = rows + scrollback | 指标准确性 |
| D3 | 运行 `seq 1 10000` | bufferLines 达到 scrollback 上限 | 滚动缓冲 |
| D4 | 导出 JSON（Ctrl+Shift+E） | 剪贴板有完整数据 | 导出逻辑 |

### 测试组 E — 交叉场景

| ID | 操作 | 预期 | 风险点 |
|----|------|------|--------|
| E1 | 创建 5 Tab → 拖拽重排序 → Cmd+数字切换 | 快捷键对应新顺序 | index 映射 |
| E2 | zoom 状态下关闭 Tab | zoom 清除 | state 清理 |
| E3 | 非活跃 Tab 有输出 → 关闭该 Tab | PTY 正确 kill | cleanup 顺序 |
| E4 | 窗口 resize + Tab 切换同时进行 | 终端尺寸正确 | fitAddon 竞态 |
| E5 | Selector 滚动 + Tab 切换 | 无黑色色块 | display:none 逻辑 |

---

## 执行计划

### Phase 1：单元测试补充（已完成）

- [x] debug-metrics.test.ts：8 个测试覆盖 updateTabMetrics、removeTabMetrics、createByteRateTracker
- [ ] TerminalView 关键逻辑测试（PTY 延迟 spawn、缓冲区管理）

### Phase 2：手动压力测试

用户按测试清单逐项操作，记录结果。

### Phase 3：WebGL addon 验证（待定）

- [ ] 检查 Tauri WebKit 是否支持 WebGL
- [ ] 如支持，启用 WebGL addon 对比渲染性能

---

## 风险评级

| 问题 | 级别 | 建议 |
|------|------|------|
| 缓冲区单 chunk 无上限 | MEDIUM | 增加 256KB 单 chunk 限制 |
| renderService 内部 API | HIGH | 标记为技术债务，监控 xterm.js 版本 |
| 字节率计算失真 | LOW | 限制 elapsed 最大值 |
| 10+ Tab 内存压力 | MEDIUM | 实测验证，必要时限制 Tab 数量 |

---

## 参考资料

- [FIX-2026-05-08-multitab-performance-optimization.md](FIX-2026-05-08-multitab-performance-optimization.md)
- [PLAN-2026-05-06-stress-test.md](../../hermes-box/worklog/PLAN-2026-05-06-stress-test.md)
