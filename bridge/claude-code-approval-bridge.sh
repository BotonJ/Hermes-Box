#!/usr/bin/env bash
# HermesBox — Claude Code PreToolUse 审批桥接脚本
#
# Claude Code 在 Bash 工具执行前调用此脚本。
# 将命令写入 pending 目录，轮询等待 HermesBox（或用户）审批结果。
#
# 用法：
#   在 .claude/settings.json 中配置 PreToolUse hook：
#     "hooks": {
#       "PreToolUse": [
#         {"matcher": "Bash", "command": "/path/to/this/script.sh"}
#       ]
#     }
#
# 环境变量（可选）：
#   HERMESBOX_PENDING_DIR  请求目录（默认 ~/.hermesbox/approvals/pending）
#   HERMESBOX_RESULTS_DIR  结果目录（默认 ~/.hermesbox/approvals/results）
#   HERMESBOX_TIMEOUT      等待超时秒数（默认 30）

set -euo pipefail

PENDING_DIR="${HERMESBOX_PENDING_DIR:-$HOME/.hermesbox/approvals/pending}"
RESULTS_DIR="${HERMESBOX_RESULTS_DIR:-$HOME/.hermesbox/approvals/results}"
TIMEOUT="${HERMESBOX_TIMEOUT:-120}"

# 筛选：只拦截 Bash 工具
# fallback "UNKNOWN" 确保 python3 缺失时 fail-closed（安全优先）
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "UNKNOWN")

if [ "$TOOL_NAME" != "Bash" ]; then
  if [ "$TOOL_NAME" = "UNKNOWN" ]; then
    exit 1  # JSON 解析失败 → 安全拒绝
  fi
  exit 0
fi

mkdir -p "$PENDING_DIR" "$RESULTS_DIR"

if command -v shasum &>/dev/null; then
  HASH=$(date +%s%N | shasum -a 256 | head -c 8)
elif command -v sha256sum &>/dev/null; then
  HASH=$(date +%s%N | sha256sum | head -c 8)
else
  HASH=$(date +%s | md5sum 2>/dev/null | head -c 8 || date +%s)
fi
REQ_ID="approval-${HASH}"
PENDING_FILE="$PENDING_DIR/$REQ_ID.json"
RESULT_FILE="$RESULTS_DIR/$REQ_ID.json"

# 原子写入：先写临时文件，再 rename（防止 watcher 读到不完整 JSON）
TMP_FILE="$PENDING_DIR/$REQ_ID.json.tmp"
echo "$INPUT" > "$TMP_FILE"
mv "$TMP_FILE" "$PENDING_FILE"

# 轮询等待结果
DEADLINE=$(($(date +%s) + TIMEOUT))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if [ -f "$RESULT_FILE" ]; then
    ACTION=$(python3 -c "import sys,json; print(json.load(open(sys.argv[1])).get('action','deny'))" "$RESULT_FILE" 2>/dev/null || echo "deny")
    rm -f "$RESULT_FILE" "$PENDING_FILE"
    if [ "$ACTION" = "approve" ]; then
      exit 0
    else
      exit 1
    fi
  fi
  sleep 0.5
done

# 超时：安全默认拒绝
rm -f "$PENDING_FILE"
exit 1
