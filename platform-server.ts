#!/usr/bin/env bun
/**
 * Multi-Platform Server Entry Point
 *
 * Usage:
 *   bun platform-server.ts --config platforms.yaml
 *   bun platform-server.ts --port 8080 --feishu-app-id cli_xxx --feishu-app-secret xxx
 *   bun platform-server.ts --wechat-personal --webchat --workspace ~/my-project
 */

import { parseArgs } from './src/webchat/config.js'
import { startMultiPlatformServer } from './src/platforms/server.js'
import type { MultiPlatformConfig, PlatformConfig } from './src/platforms/types.js'
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'yaml'

// 默认配置
const defaultConfig: MultiPlatformConfig = {
  port: 8080,
  host: '0.0.0.0',
  platforms: {},
}

// 解析命令行参数
function parsePlatformArgs(args: string[]): MultiPlatformConfig {
  // 先检查 --config
  let fileConfig: any = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' || args[i] === '-c') {
      const configPath = args[++i]
      fileConfig = loadYamlConfig(configPath)
      break
    }
  }

  const config: any = {
    ...defaultConfig,
    ...fileConfig,
    platforms: { ...(fileConfig.platforms || {}) },
  }

  // CLI 参数覆盖文件配置
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--port' || arg === '-p') {
      config.port = parseInt(args[++i], 10)
    } else if (arg === '--host' || arg === '-h') {
      config.host = args[++i]

    // ── 全局选项 ──
    } else if (arg === '--webchat') {
      config.webchatEnabled = true
    } else if (arg === '--workspace' || arg === '--working-dir') {
      config.workspaceDir = args[++i]
    } else if (arg === '--settings' || arg === '--settings-path') {
      config.settingsPath = args[++i]
    } else if (arg === '--permission-mode') {
      config.permissionMode = args[++i] // ask | auto-approve | auto-deny
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true
    } else if (arg === '--unattended') {
      config.unattended = config.unattended || {}
      config.unattended.enabled = true
    } else if (arg === '--max-duration') {
      config.unattended = config.unattended || { enabled: false }
      config.unattended.maxDuration = parseInt(args[++i], 10)
    } else if (arg === '--max-tool-calls') {
      config.unattended = config.unattended || { enabled: false }
      config.unattended.maxToolCalls = parseInt(args[++i], 10)
    } else if (arg === '--allowed-tools') {
      config.unattended = config.unattended || { enabled: false }
      config.unattended.allowedTools = args[++i].split(',')
    } else if (arg === '--max-sessions') {
      config.maxSessions = parseInt(args[++i], 10)
    } else if (arg === '--session-timeout') {
      config.sessionTimeoutMs = parseInt(args[++i], 10)
    } else if (arg === '--auth-token') {
      config.authToken = args[++i]

    // ── 飞书 ──
    } else if (arg === '--feishu-app-id') {
      config.platforms.feishu = config.platforms.feishu || createDefaultPlatformConfig('/webhook/feishu')
      config.platforms.feishu.appId = args[++i]
      config.platforms.feishu.enabled = true
    } else if (arg === '--feishu-app-secret') {
      config.platforms.feishu = config.platforms.feishu || createDefaultPlatformConfig('/webhook/feishu')
      config.platforms.feishu.appSecret = args[++i]
    } else if (arg === '--feishu-token') {
      config.platforms.feishu = config.platforms.feishu || createDefaultPlatformConfig('/webhook/feishu')
      config.platforms.feishu.token = args[++i]

    // ── 企业微信 ──
    } else if (arg === '--wechat-app-id') {
      config.platforms.wechat = config.platforms.wechat || createDefaultPlatformConfig('/webhook/wechat')
      config.platforms.wechat.appId = args[++i]
      config.platforms.wechat.enabled = true
    } else if (arg === '--wechat-app-secret') {
      config.platforms.wechat = config.platforms.wechat || createDefaultPlatformConfig('/webhook/wechat')
      config.platforms.wechat.appSecret = args[++i]
    } else if (arg === '--wechat-token') {
      config.platforms.wechat = config.platforms.wechat || createDefaultPlatformConfig('/webhook/wechat')
      config.platforms.wechat.token = args[++i]

    // ── 个人微信（iLink） ──
    } else if (arg === '--wechat-personal') {
      config.platforms['wechat-personal'] = config.platforms['wechat-personal'] || createWeChatPersonalConfig()
      config.platforms['wechat-personal'].enabled = true
    } else if (arg === '--wechat-ilink-url') {
      config.platforms['wechat-personal'] = config.platforms['wechat-personal'] || createWeChatPersonalConfig()
      config.platforms['wechat-personal'].ilinkBaseUrl = args[++i]
    } else if (arg === '--wechat-workspace') {
      config.platforms['wechat-personal'] = config.platforms['wechat-personal'] || createWeChatPersonalConfig()
      config.platforms['wechat-personal'].autoReply = config.platforms['wechat-personal'].autoReply || {}
      config.platforms['wechat-personal'].autoReply.workspaceDir = args[++i]
    } else if (arg === '--wechat-allow-user') {
      config.platforms['wechat-personal'] = config.platforms['wechat-personal'] || createWeChatPersonalConfig()
      config.platforms['wechat-personal'].filter = config.platforms['wechat-personal'].filter || {}
      config.platforms['wechat-personal'].filter.allowedUsers = config.platforms['wechat-personal'].filter.allowedUsers || []
      config.platforms['wechat-personal'].filter.allowedUsers.push(args[++i])
    } else if (arg === '--wechat-ignore-rooms') {
      config.platforms['wechat-personal'] = config.platforms['wechat-personal'] || createWeChatPersonalConfig()
      config.platforms['wechat-personal'].filter = config.platforms['wechat-personal'].filter || {}
      config.platforms['wechat-personal'].filter.ignoreRooms = true

    // ── 钉钉 ──
    } else if (arg === '--dingtalk-app-id') {
      config.platforms.dingtalk = config.platforms.dingtalk || createDefaultPlatformConfig('/webhook/dingtalk')
      config.platforms.dingtalk.appId = args[++i]
      config.platforms.dingtalk.enabled = true
    } else if (arg === '--dingtalk-app-secret') {
      config.platforms.dingtalk = config.platforms.dingtalk || createDefaultPlatformConfig('/webhook/dingtalk')
      config.platforms.dingtalk.appSecret = args[++i]

    // ── 其他 ──
    } else if (arg === '--config' || arg === '-c') {
      ++i // 已处理
    } else if (arg === '--help') {
      printHelp()
      process.exit(0)
    }
  }

  return config as MultiPlatformConfig
}

// 加载 YAML 配置文件
function loadYamlConfig(configPath: string): any {
  const resolved = path.resolve(configPath)
  if (!fs.existsSync(resolved)) {
    console.error(`Config file not found: ${resolved}`)
    process.exit(1)
  }
  const content = fs.readFileSync(resolved, 'utf-8')
  try {
    return yaml.parse(content)
  } catch (err) {
    console.error(`Failed to parse config file: ${err}`)
    process.exit(1)
  }
}

function createDefaultPlatformConfig(path: string): PlatformConfig {
  return {
    enabled: true,
    path,
    features: {
      streaming: false,
      richText: true,
      file: true,
      mention: true,
    },
    session: {
      createOnMessage: true,
      timeout: 30 * 60 * 1000,
      maxPerUser: 5,
    },
  }
}

function createWeChatPersonalConfig(): any {
  return {
    enabled: true,
    path: '/webhook/wechat-personal',
    protocol: 'ilink',
    autoLogin: true,
    loginTimeout: 300,
    reconnect: {
      enabled: true,
      maxRetries: 10,
      interval: 5000,
    },
    filter: {
      ignoreRooms: false,
      ignoreOfficial: true,
    },
    features: {
      streaming: false,
      richText: false,
      file: true,
      mention: true,
    },
    session: {
      createOnMessage: true,
      timeout: 30 * 60 * 1000,
      maxPerUser: 5,
    },
    autoReply: {
      enabled: true,
      settingSources: 'user',
      maxMessageChars: 8000,
      maxHistoryChars: 16000,
      maxHistoryTurns: 6,
      timeoutMs: 120_000,
      retryBaseMs: 5000,
      retryMaxMs: 300_000,
    },
  }
}

function printHelp(): void {
  console.log(`
Multi-Platform Server - Connect IM platforms to Claude Code

Usage:
  bun platform-server.ts [options]
  bun platform-server.ts --config platforms.yaml

Global Options:
  -c, --config <path>         Load config from YAML file
  -p, --port <number>         Server port (default: 8080)
  -h, --host <string>         Server host (default: 0.0.0.0)
  -v, --verbose               Enable verbose logging

Session & Claude:
  --webchat                   Enable WebChat UI (http://localhost:8080/)
  --workspace <dir>           Default Claude workspace directory
  --settings <path>           Claude settings file path
  --permission-mode <mode>    Permission mode: ask | auto-approve | auto-deny
  --auth-token <token>        API authentication token
  --max-sessions <n>          Max concurrent sessions (default: 100)
  --session-timeout <ms>      Session timeout in ms (default: 1800000)

Unattended Mode:
  --unattended                Enable unattended (无人值守) mode
  --max-duration <ms>         Max execution duration per task (default: 3600000)
  --max-tool-calls <n>        Max tool calls per task (default: 1000)
  --allowed-tools <list>      Comma-separated allowed tools

Feishu (飞书):
  --feishu-app-id <id>        Feishu App ID
  --feishu-app-secret <s>     Feishu App Secret
  --feishu-token <t>          Feishu verification token

WeChat Enterprise (企业微信):
  --wechat-app-id <id>        WeChat Corp ID
  --wechat-app-secret <s>     WeChat Corp Secret
  --wechat-token <t>          WeChat verification token

WeChat Personal (个人微信) - ⚠️ 封号风险:
  --wechat-personal           Enable personal WeChat (iLink protocol)
  --wechat-ilink-url <url>    iLink API base URL (default: https://ilinkai.weixin.qq.com)
  --wechat-workspace <dir>    Claude workspace directory
  --wechat-allow-user <wxid>  Only process messages from this user (repeatable)
  --wechat-ignore-rooms       Ignore all room/group messages

DingTalk (钉钉):
  --dingtalk-app-id <id>      DingTalk App ID
  --dingtalk-app-secret <s>   DingTalk App Secret

Examples:
  # All platforms + webchat + unattended
  bun platform-server.ts \\
    --webchat \\
    --unattended \\
    --permission-mode auto-approve \\
    --workspace ~/my-project \\
    --feishu-app-id cli_xxx --feishu-app-secret xxx \\
    --wechat-personal --wechat-workspace ~/my-project \\
    --port 8080

  # From config file
  bun platform-server.ts --config platforms.yaml

  # Personal WeChat only
  bun platform-server.ts --wechat-personal --workspace ~/my-project

  # Feishu only
  bun platform-server.ts --feishu-app-id cli_xxx --feishu-app-secret xxx

⚠️ Warning: Personal WeChat uses third-party protocols, may have ban risks.
   Use with caution and prefer small test accounts.
`)
}

// 主函数
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    printHelp()
    process.exit(0)
  }

  const config = parsePlatformArgs(args)

  // 检查是否至少启用了一个平台
  const enabledPlatforms = Object.values(config.platforms).filter((p: any) => p.enabled)
  if (enabledPlatforms.length === 0 && !(config as any).webchatEnabled) {
    console.error('Error: No platform enabled. Please provide platform credentials or --webchat.')
    printHelp()
    process.exit(1)
  }

  // 处理关闭信号
  const shutdown = async () => {
    console.log('\nShutting down...')
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // 启动服务
  try {
    await startMultiPlatformServer(config)
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

main()
