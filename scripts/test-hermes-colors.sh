#!/bin/bash
# 测试 Hermes 颜色 patch 的可行性
# 验证：路径发现、文件读取、正则替换

set -e

HERMES_WRAPPER="$HOME/.local/bin/hermes"

echo "=== 1. 路径发现 ==="
if [ ! -f "$HERMES_WRAPPER" ]; then
  echo "FAIL: $HERMES_WRAPPER 不存在"
  exit 1
fi
echo "OK: wrapper 存在"

SHEBANG=$(head -1 "$HERMES_WRAPPER")
echo "   shebang: $SHEBANG"

# 从 shebang 提取安装目录
# #!/home/testuser/hermes-agent-2026.4.23/venv/bin/python
INSTALL_DIR=$(echo "$SHEBANG" | sed 's|#!\(.*\)/venv/bin/python|\1|')
HERMES_CLI_DIR="$INSTALL_DIR/hermes_cli"

echo "   install: $INSTALL_DIR"
echo "   cli dir: $HERMES_CLI_DIR"

if [ ! -d "$HERMES_CLI_DIR" ]; then
  echo "FAIL: $HERMES_CLI_DIR 不存在"
  exit 1
fi
echo "OK: cli 目录存在"

echo ""
echo "=== 2. 目标文件检查 ==="

for f in skin_engine.py banner.py; do
  TARGET="$HERMES_CLI_DIR/$f"
  if [ ! -f "$TARGET" ]; then
    echo "FAIL: $TARGET 不存在"
  else
    echo "OK: $TARGET ($(< "$TARGET" wc -l | tr -d ' ') 行)"
  fi
done

echo ""
echo "=== 3. skin_engine.py 当前值 ==="

grep -n '"banner_text"' "$HERMES_CLI_DIR/skin_engine.py" | head -3
grep -n '"prompt"' "$HERMES_CLI_DIR/skin_engine.py" | head -3

echo ""
echo "=== 4. banner.py 当前值（6 个变量）==="

for var in accent dim text session_color title_color border_color; do
  grep -n "^${var} = " "$HERMES_CLI_DIR/banner.py" | head -1
done

echo ""
echo "=== 5. 正则替换预演（dry-run）==="

# skin_engine.py: banner_text
BEFORE_SE=$(grep '"banner_text":' "$HERMES_CLI_DIR/skin_engine.py" | head -1)
AFTER_SE=$(echo "$BEFORE_SE" | sed 's/"banner_text": "[^"]*"/"banner_text": "#C5A882"/')
echo "skin_engine banner_text:"
echo "  before: $BEFORE_SE"
echo "  after:  $AFTER_SE"

# skin_engine.py: prompt
BEFORE_PR=$(grep '"prompt":' "$HERMES_CLI_DIR/skin_engine.py" | head -1)
AFTER_PR=$(echo "$BEFORE_PR" | sed 's/"prompt": "[^"]*"/"prompt": "#000000"/')
echo "skin_engine prompt:"
echo "  before: $BEFORE_PR"
echo "  after:  $AFTER_PR"

# banner.py: 6 variables
echo "banner.py variables:"
for var in accent dim text session_color title_color border_color; do
  LINE=$(grep "^${var} = " "$HERMES_CLI_DIR/banner.py" | head -1)
  NEW=$(echo "$LINE" | sed "s/^${var} = \"[^\"]*\"$/${var} = \"#C5A882\"/")
  echo "  $var: $LINE → $NEW"
done

echo ""
echo "=== 全部检查完成 ==="
