# MyClaude Code

![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) ![](https://img.shields.io/badge/Bun-1.0%2B-blue?style=flat-square)

基于 [Claude Code](https://claude.com/product/claude-code) 的增强版 AI 编程助手，支持多平台消息对接（飞书、微信、WebChat）和插件系统。基于claude-code-leak开发，仅用于个人研究。

## 特性

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


# 多平台同时启动（推荐）
myclaude platforms --config platforms.yaml

# WebChat + 个人微信 + 飞书（全功能）
myclaude platforms \
  --webchat --port 8080 \
  --wechat --wechat-workspace ~/my-project \
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

### --settings 模型配置

通过 `--settings` 指定模型配置文件，用于自定义 API 端点、模型选择等：

```bash
# 指定配置文件启动
myclaude webchat --port 8080 --settings ~/.cc-setting/settings.json
myclaude wechat webchat --port 8082 --settings ./my-settings.json
myclaude platforms --config platforms.yaml --settings ./my-settings.json
```

配置文件示例（`settings.json`）：

```json
{
  "apiProvider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "apiKey": "sk-ant-xxx",
  "apiBaseUrl": "https://api.anthropic.com",
  "maxTokens": 16384,
  "temperature": 1.0,
  "permissionMode": "ask"
}
```

### 插件配置

插件通过 MCP（Model Context Protocol）服务器扩展能力，支持工具、资源和提示词模板。

```bash
# 查看和管理插件
myclaude plugin list
myclaude plugin install <plugin-name>
myclaude plugin remove <plugin-name>
```

也可在 `settings.json` 中直接配置 MCP 服务器：

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-example"],
      "env": {
        "API_KEY": "xxx"
      }
    },
    "local-tool": {
      "command": "node",
      "args": ["./my-mcp-server.js"],
      "cwd": "/path/to/project"
    }
  }
}
```

MCP 服务器配置字段说明：

| 字段 | 说明 |
|------|------|
| `command` | 启动 MCP 服务器的命令 |
| `args` | 命令参数列表 |
| `env` | 环境变量 |
| `cwd` | 工作目录（可选） |

### 插件市场配置

支持从 GitHub 仓库、URL 或 Git 仓库添加插件市场源。

在 `settings.json` 中通过 `extraKnownMarketplaces` 添加第三方市场：

```json
{
  "extraKnownMarketplaces": {
    "my-team-plugins": {
      "source": {
        "source": "github",
        "repo": "my-org/claude-plugins",
        "ref": "main"
      }
    },
    "private-plugins": {
      "source": {
        "source": "url",
        "url": "https://example.com/plugins/marketplace.json",
        "headers": {
          "Authorization": "Bearer xxx"
        }
      }
    },
    "git-plugins": {
      "source": {
        "source": "git",
        "url": "https://gitlab.com/team/claude-plugins.git",
        "ref": "v1.0.0"
      }
    }
  }
}
```

也可在 `.claude/settings.json`（项目级）中配置，确保团队成员自动获得插件源。

市场源类型说明：

| 类型 | `source` 值 | 必填字段 | 说明 |
|------|------------|---------|------|
| GitHub | `"github"` | `repo`（owner/repo） | 可选 `ref` 指定分支/标签，`path` 指定 marketplace.json 路径 |
| URL | `"url"` | `url` | 直连 marketplace.json 地址，可选 `headers` 用于认证 |
| Git | `"git"` | `url`（https:// 或 git@） | 可选 `ref` 指定分支/标签，`sha` 指定 commit |

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

## License

GPL
