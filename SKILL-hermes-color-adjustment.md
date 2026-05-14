---
name: hermes-color-adjustment
description: Hermes 字体颜色快速调整 - 通过修改 banner.py 和 skin_engine.py 实时调整 Hermes CLI 的各类文字颜色
category: devops
---

# Hermes 字体颜色快速调整

## 触发条件

当用户想要：
- 调整 Hermes Banner 区域所有文字颜色（标题、边框、路径、Session ID 等）
- 调整输入提示符（prompt）颜色
- 调整响应框内文字（banner_text）颜色
- 一次性统一所有文字为同一颜色

---

## 核心概念

### 颜色控制两级架构

Hermes 的颜色系统分为两层：

| 层级 | 文件 | 控制的颜色 |
|------|------|-----------|
| **Banner 层** | `banner.py` | `banner_title`、`banner_border`、`banner_accent`、`banner_dim`、`banner_text`（Banner 区域）、`session_border` |
| **Skin 层** | `skin_engine.py` | `banner_text`（响应框）、`prompt`（输入提示符） |

### 关键路径

找到运行时加载的 Hermes 安装目录：

```bash
which hermes
# 输出通常是 ~/.local/bin/hermes 或 /opt/.../hermes

# 然后顺着 venv 的 pth 文件找到实际加载的路径
cat ~/.local/bin/hermes
```

运行时目录结构：
```
<HERMES_INSTALL_DIR>/hermes_cli/
├── banner.py       # Banner 硬编码颜色
└── skin_engine.py  # Skin 内置主题颜色
```

> ⚠️ 源码目录（如 `~/hermes-agent/hermes_cli/`）**不会被运行时加载**，修改无效。必须确认 `which hermes` 指向的实际路径。

---

## 颜色 Key 速查表

| Key | 用途 | 影响范围 |
|-----|------|---------|
| `banner_title` | Banner 标题颜色 | 版本号那行 |
| `banner_border` | Banner 边框颜色 | Panel 边框 |
| `banner_accent` | Banner 强调色 | Available Tools 标题等 |
| `banner_dim` | Banner 暗淡色 | cwd 路径、Session ID 等 |
| `banner_text` | Banner/响应框文字 | tool 名字、skill 名字、welcome 文本 |
| `prompt` | 输入提示符颜色 | prompt_toolkit 输入行 |
| `session_border` | Session ID 文字颜色 | Session ID 那行 |

---

## 快速修改步骤

### 步骤 1: 找到运行时路径

```bash
which hermes
# 查看 hermes 脚本内容，找到它指向的 venv
# venv 中有 .pth 文件指向实际的 hermes_cli 源码目录
```

### 步骤 2: 修改 banner.py

**第 360-363 行** — `build_welcome_banner()` 函数内：
```python
accent = "#你的颜色"
dim = "#你的颜色"
text = "#你的颜色"
session_color = "#你的颜色"
```

**第 520-521 行**：
```python
title_color = "#你的颜色"
border_color = "#你的颜色"
```

### 步骤 3: 修改 skin_engine.py

**第 172 行** — `banner_text`：
```python
"banner_text": "#你的颜色",
```

**第 178 行** — `prompt`：
```python
"prompt": "#你的颜色",
```

### 步骤 4: 验证生效

```bash
hermes
```

---

## 常用颜色参考

| 颜色名 | HEX | 效果 |
|--------|-----|------|
| 奶白色 (Cornsilk) | `#FFF8DC` | 出厂默认，柔和淡雅 |
| 象牙白 (Ivory) | `#FFFFF0` | 柔和、淡雅 |
| 暖沙金 | `#C5A882` | 温暖、金色系 |
| 金色 (Gold) | `#FFD700` | 高对比度金色 |
| 纯黑 | `#000000` | 高对比度 |
| 纯白 | `#FFFFFF` | 浅色背景用 |
| 浅灰 | `#D3D3D3` | 低对比度柔和 |

---

## 浅色终端主题适配（暖沙金 + 黑字）

当用户反映使用浅色终端主题时 Hermes 文字看不清，执行以下修改：

### 场景

- 终端背景：浅色（如 Flexoki Light `#fffcf0` 或类似）
- Hermes 默认金色/奶白色在浅色背景下对比度不足，看不清

### 方案：暖沙金文字 + 黑色 prompt

**修改 skin_engine.py：**
```bash
sed -i '' 's/"banner_text": "[^"]*",/"banner_text": "#C5A882",/' \
  <HERMES_INSTALL_DIR>/hermes_cli/skin_engine.py

sed -i '' 's/"prompt": "[^"]*",/"prompt": "#000000",/' \
  <HERMES_INSTALL_DIR>/hermes_cli/skin_engine.py
```

**修改 banner.py：**
```bash
sed -i '' 's/^accent = "[^"]*"$/accent = "#C5A882"/' \
  <HERMES_INSTALL_DIR>/hermes_cli/banner.py
sed -i '' 's/^dim = "[^"]*"$/dim = "#C5A882"/' \
  <HERMES_INSTALL_DIR>/hermes_cli/banner.py
sed -i '' 's/^text = "[^"]*"$/text = "#C5A882"/' \
  <HERMES_INSTALL_DIR>/hermes_cli/banner.py
sed -i '' 's/^session_color = "[^"]*"$/session_color = "#C5A882"/' \
  <HERMES_INSTALL_DIR>/hermes_cli/banner.py
sed -i '' 's/^title_color = "[^"]*"$/title_color = "#C5A882"/' \
  <HERMES_INSTALL_DIR>/hermes_cli/banner.py
sed -i '' 's/^border_color = "[^"]*"$/border_color = "#C5A882"/' \
  <HERMES_INSTALL_DIR>/hermes_cli/banner.py
```

### 回退（恢复出厂奶白色）

```bash
# skin_engine.py
sed -i '' 's/"banner_text": "[^"]*",/"banner_text": "#FFF8DC",/' \
  <HERMES_INSTALL_DIR>/hermes_cli/skin_engine.py
sed -i '' 's/"prompt": "[^"]*",/"prompt": "#FFF8DC",/' \
  <HERMES_INSTALL_DIR>/hermes_cli/skin_engine.py

# banner.py（还原为 _skin_color() 调用）
sed -i '' 's/^accent = "[^"]*"$/accent = _skin_color("banner_accent", "#FFBF00")/' \
  <HERMES_INSTALL_DIR>/hermes_cli/banner.py
# （其余 dim/text/session_color/title_color/border_color 同理还原）
```

---

## 经验总结

### 1. 只改 prompt 颜色时，只需动 skin_engine.py

banner.py 控制的是 Banner 区域的静态文字（版本号、路径、Session ID 等），**prompt 颜色只受 skin_engine.py 的 `prompt` 字段控制**。

### 2. 改输出文字颜色（响应框内文字），改 banner_text

用户所说的"输出字体颜色"（AI 回复的文字颜色）对应 skin_engine.py 的 `banner_text` 字段。

### 3. skin_engine.py 的 `_BUILTIN_SKINS["default"]` 控制默认皮肤

`banner_text` 和 `prompt` 都在 `_BUILTIN_SKINS["default"]["colors"]` 字典里，这是默认皮肤的源头。

### 4. banner.py 有硬编码覆盖逻辑 — 恢复出厂时必须同时检查两处

`build_welcome_banner()` 函数内部会将某些颜色**再次硬编码覆盖**（第 360-363 行、520-521 行），覆盖优先级高于 skin_engine.py。

**关键经验**：恢复出厂设置时，只还原 skin_engine.py 是不够的。必须同时检查并还原 banner.py 的这两处。如果只动 skin_engine.py 而 banner.py 还残留硬编码，颜色依然不对。

### 5. 一键调整只改 prompt 时

```bash
sed -i '' 's/"prompt": "[^"]*",/"prompt": "#你的颜色",/' \
  <HERMES_INSTALL_DIR>/hermes_cli/skin_engine.py
```

### 6. 验证顺序

先单独验证 skin_engine.py（改 prompt），再检查是否需要改 banner.py（改 Banner 文字）。

---

## 出厂默认值参考

### skin_engine.py 默认值

```python
"banner_text": "#FFF8DC",
"prompt": "#FFF8DC",
```

### banner.py 默认值（调用 _skin_color()）

```python
# 第 360-363 行
accent = _skin_color("banner_accent", "#FFBF00")
dim = _skin_color("banner_dim", "#B8860B")
text = _skin_color("banner_text", "#FFF8DC")
session_color = _skin_color("session_border", "#8B8682")

# 第 520-521 行
title_color = _skin_color("banner_title", "#FFD700")
border_color = _skin_color("banner_border", "#CD7F32")
```

---

## 完整颜色统一脚本

```bash
#!/bin/bash
# 用法: hermes-color.sh "#C5A882"

COLOR="$1"
if [ -z "$COLOR" ]; then
    echo "用法: hermes-color.sh \"#RRGGBB\""
    exit 1
fi

INSTALLER="$HOME/.local/lib/pythonX.X/site-packages/hermes_cli"
# 或找到 which hermes 指向的实际路径

# 修改 banner.py 第 360-363 行
sed -i '' "s/^accent = \"[^\"]*\"$/accent = \"$COLOR\"/" "$INSTALLER/banner.py"
sed -i '' "s/^dim = \"[^\"]*\"$/dim = \"$COLOR\"/" "$INSTALLER/banner.py"
sed -i '' "s/^text = \"[^\"]*\"$/text = \"$COLOR\"/" "$INSTALLER/banner.py"
sed -i '' "s/^session_color = \"[^\"]*\"$/session_color = \"$COLOR\"/" "$INSTALLER/banner.py"

# 修改 banner.py 第 520-521 行
sed -i '' "s/^title_color = \"[^\"]*\"$/title_color = \"$COLOR\"/" "$INSTALLER/banner.py"
sed -i '' "s/^border_color = \"[^\"]*\"$/border_color = \"$COLOR\"/" "$INSTALLER/banner.py"

# 修改 skin_engine.py
sed -i '' "s/\"banner_text\": \"[^\"]*\",/\"banner_text\": \"$COLOR\",/" "$INSTALLER/skin_engine.py"
sed -i '' "s/\"prompt\": \"[^\"]*\",/\"prompt\": \"$COLOR\",/" "$INSTALLER/skin_engine.py"

echo "已修改所有颜色为: $COLOR"
echo "重启 hermes 生效"
```

使用方法：
```bash
chmod +x hermes-color.sh
./hermes-color.sh "#FFFFF0"  # 象牙白
```

---

## 注意事项

1. **必须找到正确的运行时路径**：`which hermes` 找到实际加载的 hermes_cli 目录
2. **修改后需重启**：Hermes 不支持热更新，重启命令才能看到效果
3. **备份原始文件**：首次修改前建议备份
4. **颜色对比度**：浅色背景建议用深色文字（如 `#000000`），深色背景反之
5. **恢复出厂必须两处都还原**：skin_engine.py 和 banner.py 缺一不可


###应用示例

---

**最后更新**: 2026-05-13
