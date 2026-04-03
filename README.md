# MyClaude Code

![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) ![](https://img.shields.io/badge/Bun-1.0%2B-blue?style=flat-square)

基于 [Claude Code](https://claude.com/product/claude-code) 的增强版 AI 编程助手，支持多平台消息对接（飞书、微信、WebChat）和插件系统。基于claude-code-leak开发，仅用于个人研究。

## 特性

- **终端 CLI** — 原生 Claude Code 体验，支持所有工具和命令
- **WebChat** — 浏览器访问的 Web 聊天界面，支持流式输出、多会话管理
- **多平台对接** — 飞书、企业微信、个人微信，将 AI 助手接入即时通讯
- **插件系统** — 内置插件市场，支持 MCP 服务器和自定义技能扩展
- **Unattended 模式** — 无人值守自动执行，适用于 CI/CD 和定时任务

## 快速开始

### 安装依赖

需要 [Bun](https://bun.sh/) >= 1.0.0 和 Node.js >= 18.0.0。

```bash
bun install
```

### 构建

```bash
bun build cli.ts --outfile cli.js --target=bun
```

### 打包发布

```bash
AUTHORIZED=1 npm pack
# 生成 openclaude-ai-myclaude-code-{version}.tgz
```

### 全局安装

```bash
npm install -g openclaude-ai-myclaude-code-2.1.88.1.tgz
```

## 使用

```bash
# 终端交互模式
myclaude

# 查看帮助
myclaude --help
```

### WebChat

```bash
# 启动 Web 聊天界面
myclaude webchat --port 3002 --host 0.0.0.0
```

### 多平台服务

```bash
# 飞书
myclaude feishu --app-id cli_xxx --app-secret xxx

# 企业微信
myclaude wecom --app-id wwxxx --app-secret xxx

# 个人微信（扫码登录）
myclaude wechat --workspace ~/my-project

# 个人微信

# 多平台同时启动（推荐）
myclaude platforms --config platforms.yaml

# WebChat + 个人微信 + 飞书（全功能）
myclaude platforms \
  --webchat --port 8080 \
  --wechat-personal --wechat-workspace ~/my-project \
  --feishu-app-id cli_xxx --feishu-app-secret xxx
```

### Unattended 模式

```bash
# 基本用法
myclaude --unattended --allowed-tools Read,Write,Edit "Fix all lint errors"

# 使用配置文件
myclaude --unattended --unattended-config ~/.claude/unattended.json "Run tests"

# CI/CD 场景
myclaude --unattended --max-duration 1800000 \
  --allowed-tools Read,Grep,Glob,Bash\(git:\*\) \
  "Review all changes in current branch"
```

### 平台配置文件示例

```yaml
port: 8080
host: "0.0.0.0"

claude:
  settingsPath: "~/.cc-setting/settings.json"
  permissionMode: "ask"

platforms:
  feishu:
    enabled: true
    path: "/webhook/feishu"
    appId: "cli_xxxxxxxxxxxx"
    appSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    features:
      streaming: false
      richText: true
  wechat-personal:
    enabled: true
    workspace: "~/my-project"
```

## 项目结构

```
open-myclaude/
├── cli.ts                  # CLI 入口
├── platform-server.ts      # 多平台服务器入口
├── wechat-personal.ts      # 个人微信入口
├── sdk-tools.d.ts          # SDK 类型声明
├── src/
│   ├── cli/                # CLI 命令处理
│   ├── commands/           # 内置命令（100+）
│   ├── components/         # 终端 UI 组件
│   ├── tools/              # 工具实现（Agent, Bash, Edit 等）
│   ├── services/           # 核心服务（MCP, LSP, OAuth 等）
│   ├── platforms/          # 多平台适配器
│   │   ├── feishu/         # 飞书
│   │   ├── wechat/         # 企业微信
│   │   └── wechat-personal/ # 个人微信
│   ├── webchat/            # WebChat 前端和后端
│   ├── plugins/            # 插件系统
│   ├── skills/             # 技能系统
│   ├── ink/                # 终端 UI 框架
│   └── utils/              # 工具函数
├── vendor/                 # 预编译二进制（ripgrep, audio-capture）
│   ├── ripgrep/            # 多平台 ripgrep 二进制
│   └── audio-capture/      # 多平台音频捕获模块
└── package.json
```

## 支持平台

| 平台 | API | 稳定性 | 推荐场景 |
|------|-----|--------|---------|
| 飞书 | ✅ 官方 API | 高 | 企业办公 |
| 企业微信 | ✅ 官方 API | 高 | 企业办公 |
| 个人微信 | ✅ 官方 iLink Bot API | 高 | 个人/企业 |
| WebChat | ✅ 内置 | 高 | 通用 |

## 开发

```bash
# 开发模式运行
bun run start

# WebChat 开发
bun run webchat

# 个人微信开发
bun run wechat

# 多平台开发
bun run platforms
```

## License

MIT
