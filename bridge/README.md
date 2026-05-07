# HermesBox — Claude Code 审批桥接 PoC

## 工作原理

```
Claude Code 要执行 Bash 命令
  → PreToolUse hook 调用 claude-code-approval-bridge.sh
  → bridge 写入审批请求到 ~/.hermesbox/approvals/pending/
  → HermesBox（或用户手动）写入响应到 ~/.hermesbox/approvals/results/
  → bridge 读到 approve → exit 0（放行）
  → bridge 读到 deny    → exit 1（阻止）
  → 超时 30s 无响应     → exit 1（安全默认拒绝）
```

## 手动验证

```bash
# 1. 启动 bridge 脚本（模拟 Claude Code 调用）
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/test"}}' | \
  bash phase3/bridge/claude-code-approval-bridge.sh &
PID=$!

# 2. 等待 pending 文件出现
sleep 1
REQ=$(ls ~/.hermesbox/approvals/pending/*.json | head -1)
cat "$REQ"  # 查看请求内容

# 3. 审批（二选一）
REQ_ID=$(basename "$REQ" .json)
echo '{"action":"approve"}' > ~/.hermesbox/approvals/results/$REQ_ID.json
# 或:
echo '{"action":"deny"}'    > ~/.hermesbox/approvals/results/$REQ_ID.json

# 4. 查看结果
wait $PID; echo "exit code: $?"
```

## Claude Code 集成

在 `.claude/settings.json` 中配置（待 Phase 3 UI 完成后启用）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "<path-to-repo>/phase3/bridge/claude-code-approval-bridge.sh"
      }
    ]
  }
}
```

## 测试

```bash
bash phase3/bridge/test-bridge.sh phase3/bridge/claude-code-approval-bridge.sh
```
