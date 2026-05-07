#!/usr/bin/env bash
# Test: claude-code-approval-bridge.sh — PoC 审批桥接脚本
set -euo pipefail

BRIDGE=$(realpath "${1:-}" 2>/dev/null || echo "")
if [ ! -x "$BRIDGE" ]; then
  echo "ERROR: bridge script not found or not executable: ${1:-}"
  exit 1
fi

TMPDIR=$(mktemp -d)
PENDING_DIR="$TMPDIR/pending"
RESULTS_DIR="$TMPDIR/results"
PASS=0
FAIL=0

cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

mkdir -p "$PENDING_DIR" "$RESULTS_DIR"

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# run_bridge: 在后台运行 bridge，等待它创建 pending 文件后触发响应，返回 exit code
# $1 = stdin JSON, $2 = timeout secs, $3 = response action ("" 表示不响应=测超时)
run_bridge() {
  local stdin_json="$1" timeout="$2" action="${3:-}"
  local pid_file="$TMPDIR/bridge.pid"
  local exit_file="$TMPDIR/bridge.exit"

  (
    echo "$stdin_json" | \
      env HERMESBOX_PENDING_DIR="$PENDING_DIR" \
          HERMESBOX_RESULTS_DIR="$RESULTS_DIR" \
          HERMESBOX_TIMEOUT="$timeout" \
          "$BRIDGE"
    echo $? > "$exit_file"
  ) &
  local pid=$!

  # 等待 pending 文件出现
  local deadline=$(($(date +%s) + timeout + 5))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local pending=$(ls "$PENDING_DIR"/*.json 2>/dev/null | head -1)
    if [ -n "$pending" ] && [ -n "$action" ]; then
      local req_id=$(basename "$pending" .json)
      echo "{\"action\":\"$action\"}" > "$RESULTS_DIR/$req_id.json"
      break
    fi
    # 如果进程已经结束，退出等待
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.2
  done

  # 等待进程结束
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$(date +%s)" -gt "$deadline" ]; then
      kill "$pid" 2>/dev/null || true
      echo "TIMEOUT" > "$exit_file"
      break
    fi
    sleep 0.2
  done
  wait "$pid" 2>/dev/null || true

  cat "$exit_file" 2>/dev/null || echo "MISSING"
}

# run_bridge_without_python: 用最小 PATH 隔离 python3，运行 bridge 并返回 exit code
run_bridge_without_python() {
  local stdin_json="$1" timeout="$2"
  local exit_file="$TMPDIR/bridge.exit"
  local safe_path="$TMPDIR/bin"

  mkdir -p "$safe_path"
  ln -sf /bin/bash "$safe_path/sh" 2>/dev/null || true
  ln -sf /bin/bash "$safe_path/bash" 2>/dev/null || true
  ln -sf /bin/date "$safe_path/date" 2>/dev/null || true
  ln -sf /bin/mkdir "$safe_path/mkdir" 2>/dev/null || true
  ln -sf /bin/rm "$safe_path/rm" 2>/dev/null || true
  ln -sf /bin/cat "$safe_path/cat" 2>/dev/null || true
  ln -sf /bin/sleep "$safe_path/sleep" 2>/dev/null || true
  ln -sf /usr/bin/shasum "$safe_path/shasum" 2>/dev/null || true
  ln -sf /usr/bin/head "$safe_path/head" 2>/dev/null || true

  (
    echo "$stdin_json" | \
      env HERMESBOX_PENDING_DIR="$PENDING_DIR" \
          HERMESBOX_RESULTS_DIR="$RESULTS_DIR" \
          HERMESBOX_TIMEOUT="$timeout" \
          PATH="$safe_path" \
          "$BRIDGE"
    echo $? > "$exit_file"
  ) &
  local pid=$!

  local deadline=$(($(date +%s) + timeout + 5))
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$(date +%s)" -gt "$deadline" ]; then
      kill "$pid" 2>/dev/null || true
      echo "TIMEOUT" > "$exit_file"
      break
    fi
    sleep 0.2
  done
  wait "$pid" 2>/dev/null || true

  cat "$exit_file" 2>/dev/null || echo "MISSING"
}

echo "=== Test 1: Approve — 用户同意，exit 0 ==="
EXIT=$(run_bridge '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/test"}}' 10 "approve")
[ "$EXIT" = "0" ] && pass "approve → exit 0" || fail "approve → exit 0 (got $EXIT)"

echo "=== Test 2: Deny — 用户拒绝，exit 1 ==="
EXIT=$(run_bridge '{"tool_name":"Bash","tool_input":{"command":"git push --force"}}' 10 "deny")
[ "$EXIT" = "1" ] && pass "deny → exit 1" || fail "deny → exit 1 (got $EXIT)"

echo "=== Test 3: Timeout — 超时无响应，exit 1（安全默认） ==="
EXIT=$(run_bridge '{"tool_name":"Bash","tool_input":{"command":"echo hello"}}' 1 "")
[ "$EXIT" = "1" ] && pass "timeout → exit 1" || fail "timeout → exit 1 (got $EXIT)"

echo "=== Test 4: Non-Bash tool — 不拦截，直接 exit 0 ==="
EXIT=$(run_bridge '{"tool_name":"Read","tool_input":{"file_path":"/tmp/foo"}}' 1 "")
[ "$EXIT" = "0" ] && pass "Read tool → exit 0" || fail "Read tool → exit 0 (got $EXIT)"

echo "=== Test 5: JSON 中含特殊字符也能正确处理 ==="
EXIT=$(run_bridge '{"tool_name":"Bash","tool_input":{"command":"echo \"double quotes\" && echo '\''single'\''"}}' 10 "approve")
[ "$EXIT" = "0" ] && pass "特殊字符 → exit 0" || fail "特殊字符 → exit 0 (got $EXIT)"

echo "=== Test 6: python3 不可用时 fail-closed（安全拒绝） ==="
EXIT=$(run_bridge_without_python '{"tool_name":"Bash","tool_input":{"command":"echo hello"}}' 2)
[ "$EXIT" = "1" ] && pass "python3 缺失 → exit 1（Bash 工具）" || fail "python3 缺失 → exit 1 (got $EXIT)"

EXIT=$(run_bridge_without_python '{"tool_name":"Read","tool_input":{"file_path":"/tmp/foo"}}' 2)
[ "$EXIT" = "1" ] && pass "python3 缺失 → exit 1（非 Bash 工具也拒绝）" || fail "python3 缺失 → exit 1 (got $EXIT)"

echo ""
echo "=== 结果 ==="
echo "通过: $PASS, 失败: $FAIL"
[ "$FAIL" -eq 0 ] && echo "✅ 全部通过" || echo "❌ 有失败"
exit $FAIL
