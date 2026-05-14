# Hermes-Box

跨平台 AI CLI 桌面面板。在一个窗口中运行 Claude Code、Hermes Agent 和多个智能体以及 Shell 标签页，内置命令审批拦截。

## 功能特性

![深色主题](public/images/start-dark.png)
![浅色主题](public/images/start-light.png)
![Claude Code](public/images/Claude%20Code.png)
![Tab 管理](public/images/tab-locker.png)

- **多标签终端** — 懒加载 PTY，多个 AI CLI 和 Shell 分标签运行，性能优先
- **多标签管理** — 对打开的标签使用右键，可以增加自定义颜色、名称和锁定，或在外部终端打开
- **CLI 选择器** — 内置检测 Claude Code、Hermes、OpenClaw、Codex、OpenCode、DeepSeek tui 及自定义 CLI 工具
- **审批系统** — 通过文件桥接拦截危险命令，在 GUI 中审批/拒绝
- **多主题** — 深色、Flexoki Light、Gruvbox Dark、Atom One Light 预设，Hermes 配色自动同步
- **外部终端** — 快速跳转到系统默认终端应用中启动 CLI
- **系统托盘** — 最小化到托盘，后台持续运行，Command+Shift+H 打开应用
- **开机启动** — 通过 LaunchAgent 设置开机启动（macOS）
- **国际化** — 支持英文和中文界面

## 安装

### macOS（GitHub Release）

从 [Releases](https://github.com/BotonJ/Hermes-Box/releases) 下载最新的 `.tar.gz`，然后：

```bash
tar xzf hermes-box-v2-*.tar.gz
mv HermesBox.app /Applications/
```

首次启动：右键点击应用 > **打开**，以绕过 Gatekeeper。

### Homebrew

```bash
brew install --cask hermes-box
```

### DMG

现在 DMG 一键安装包也支持了。

## 开发

前置依赖：[Rust](https://rustup.rs)、[Node.js](https://nodejs.org) 22+、[pnpm](https://pnpm.io)

```bash
pnpm install
pnpm tauri dev           # 开发模式，热重载
```

### 测试

```bash
pnpm test                # 前端测试（vitest）
pnpm typecheck           # TypeScript 检查
cd src-tauri
cargo test               # Rust 单元测试
cargo clippy -- -D warnings
```

### 构建

```bash
pnpm tauri build         # 输出 src-tauri/target/release/bundle/macos/HermesBox.app
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust, Tauri v2 |
| 前端 | Preact, TypeScript, xterm.js |
| 构建 | Vite, pnpm |

### 项目结构

```
src/
  App.tsx              # 视图状态机 + 标签页 + 审批集成
  components/
    TabBar.tsx         # 多标签管理
    TerminalView.tsx   # xterm.js 终端视图
    CLISelector.tsx    # CLI 检测和启动
    Settings.tsx       # 设置页面
    ContextMenu.tsx    # 标签页右键菜单
  lib/
    cli-detect.ts      # CLI 检测
    theme.ts           # 主题管理
    xterm-themes.ts    # xterm ANSI 调色板
    hermes-colors.ts   # Hermes CLI 配色同步
    approval-bridge.ts # 审批文件轮询
    tab-storage.ts     # 标签页持久化

src-tauri/src/
  lib.rs               # 插件注册和初始化
  pty.rs               # PTY 启动/写入/调整大小
  window.rs            # 窗口位置持久化
  tray.rs              # 系统托盘
  approval.rs          # 审批文件监听
  terminal.rs          # 外部终端启动
```

## 审批系统

![深色卡片](public/images/approve%20card%20dark.png)
![浅色卡片](public/images/approve%20card%20light.png)

Hermes-Box 通过 Shell Hooks 拦截 Claude Code 和 Hermes 的工具调用：

1. Hook 脚本将待审批请求写入 `~/.hermesbox/approvals/pending/`
2. Rust 文件监听器检测到新文件，向前端发送事件
3. GUI 显示审批/拒绝对话框
4. 结果写回供 CLI 消费
5. 首次使用需要在设置中为 Claude Code 和 Hermes 增加 Hooks 配置。已有配置但没有注入 Hooks 的点击按钮会先配置当前的备份再注入。其他 CLI 暂未配置，可自行增加。
6. 声音支持 — 当 Claude Code、Hermes 需要执行 Shell 命令并审批时，会自动发出声音。可以使用系统声音或上传自定义声音文件。

## 主题适配

![主题说明](public/images/主题说明.png)
![Hermes 展示说明](public/images/Hermes%20lightVSDARK.png)

大部分终端界面默认为黑色。Hermes Box 适配了 Ghostty 的浅色主题 Atom One Light 和 Flexoki Light，并且可以随着系统的深浅变化自动调整。Hermes 的色彩风格本身对浅色主题不太友好，所以特别增加了 Hermes 的浅色适配，点击即可更换 Hermes 部分文字颜色，在浅色主题下看得更加清晰，同时可以恢复默认设置。

同时附带了 **SKILL-hermes-color-adjustment.md**。将这个文档投给 Hermes，她会知道如何调整相应的字体颜色。

## 路线图

- [ ] Windows 和 Linux 支持
- [ ] 自定义 CLI 插件系统
- [ ] 原创新功能（Pin & Limit Ring）

## 鸣谢

Xiaomi Mimo V2.5pro 贡献了 90% 的代码和文档，剩下的 10% 由智谱GLM、DeepSeek 承担，以及少部分 MiniMax。
iTerm2 和 Ghostty 提供了整个开发过程的指导，并为功能借鉴和设计提供了样本。

## 开源许可

[MIT](LICENSE)