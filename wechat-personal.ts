#!/usr/bin/env bun
/**
 * Personal WeChat Server Entry Point
 *
 * ⚠️ 警告：使用第三方协议存在封号风险，请谨慎使用
 *
 * Usage:
 *   bun wechat-personal.ts                    # 使用 iLink 协议
 *   bun wechat-personal.ts --auto-reply       # 启用自动回复（默认启用）
 *   bun wechat-personal.ts --help
 */

import { WeChatPersonalAdapter } from './src/platforms/wechat-personal/adapter.js'
import type { WeChatPersonalConfig } from './src/platforms/wechat-personal/types.js'
import { WebChatSessionManager } from './src/webchat/sessionManager.js'
import path from 'node:path'

// 配置
const config: WeChatPersonalConfig = parseArgs(process.argv.slice(2))

// 解析命令行参数
function parseArgs(args: string[]): WeChatPersonalConfig {
  const cfg: WeChatPersonalConfig = {
    enabled: true,
    path: '/wechat',
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

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--ilink-url') {
      cfg.ilinkBaseUrl = args[++i]
    } else if (arg === '--ilink-account') {
      cfg.ilinkAccountName = args[++i]
    } else if (arg === '--no-reconnect') {
      cfg.reconnect.enabled = false
    } else if (arg === '--ignore-rooms') {
      cfg.filter.ignoreRooms = true
    } else if (arg === '--allow-user') {
      cfg.filter.allowedUsers = cfg.filter.allowedUsers || []
      cfg.filter.allowedUsers.push(args[++i])
    } else if (arg === '--allow-room') {
      cfg.filter.allowedRooms = cfg.filter.allowedRooms || []
      cfg.filter.allowedRooms.push(args[++i])
    } else if (arg === '--workspace') {
      cfg.autoReply.workspaceDir = args[++i]
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return cfg
}

function printHelp(): void {
  console.log(`
个人微信适配器 - 将 Claude Code 接入个人微信

⚠️  警告：使用第三方协议存在封号风险，请谨慎使用！

Usage:
  bun wechat-personal.ts [options]

Options:
  --ilink-url <url>        iLink API base URL (default: https://ilinkai.weixin.qq.com)
  --ilink-account <name>   iLink account name (default: default)
  --no-reconnect           Disable auto reconnect
  --ignore-rooms           Ignore all room messages
  --allow-user <wxid>      Only process messages from specified users
  --allow-room <roomid>    Only process messages from specified rooms
  --workspace <dir>        Claude workspace directory (for auto-reply context)
  --help, -h               Show this help message

Examples:
  # 使用 iLink 协议（默认）
  bun wechat-personal.ts

  # 指定工作目录
  bun wechat-personal.ts --workspace ~/my-project

  # 只处理特定用户的消息
  bun wechat-personal.ts --allow-user wxid_abc123 --allow-user wxid_xyz789

  # 忽略所有群消息
  bun wechat-personal.ts --ignore-rooms

⚠️  安全提醒：
  1. 使用小号测试，避免主账号被封
  2. 控制消息发送频率
  3. 不要频繁登录/登出
  4. 仅用于学习研究，不要用于商业用途
`)
}

// 主函数
async function main(): Promise<void> {
  console.log('═'.repeat(50))
  console.log('  个人微信适配器 - Claude Code')
  console.log('═'.repeat(50))
  console.log('')
  console.log('⚠️  警告：使用第三方协议存在封号风险')
  console.log('   请使用小号测试，谨慎使用！')
  console.log('')

  const autoReplyEnabled = config.autoReply?.enabled ?? true
  if (autoReplyEnabled) {
    console.log('🤖 自动回复模式已启用')
    if (config.autoReply?.workspaceDir) {
      console.log(`   工作目录: ${config.autoReply.workspaceDir}`)
    }
    console.log('')
  }

  // 运行时目录
  const runtimeDir = path.join(
    process.env.HOME || '~',
    '.claude',
    'channels',
    'wechat-personal',
  )

  // 创建 Session Manager
  const sessionManager = new WebChatSessionManager({
    port: 0, // 不启动 HTTP 服务
    host: 'localhost',
    corsOrigins: ['*'],
    maxSessions: 100,
    sessionTimeoutMs: config.session?.timeout ?? 30 * 60 * 1000,
    permissionMode: 'auto-approve', // 自动批准权限请求
    verbose: false,
  }, {
    onMessage: (sessionId, message) => {
      if (message.role === 'assistant') {
        // 将助手消息发回微信
        handleAssistantMessage(sessionId, message.content)
      }
    },
    onMessageUpdate: () => {},
    onStreamDelta: () => {},
    onThinking: () => {},
    onToolUse: () => {},
    onToolResult: () => {},
    onPermissionRequest: (sessionId, request) => {
      // 自动批准权限请求
      sessionManager.respondToPermission(sessionId, request.requestId, true)
    },
    onStatusChange: () => {},
    onError: (sessionId, error) => {
      console.error(`[Session ${sessionId}] Error:`, error.message)
    },
  })

  // 会话映射：chatId → { sessionId, lastMessageId }
  const sessionMap = new Map<string, { sessionId: string; lastMessageId: string }>()

  // 创建适配器（传入 runtimeDir 以启用 SQLite 持久化）
  const adapter = new WeChatPersonalAdapter(config, runtimeDir)

  // 处理助手消息
  async function handleAssistantMessage(sessionId: string, content: string | any[]): Promise<void> {
    const text = typeof content === 'string' ? content : content.map(c => c.text || '').join('')
    if (!text) return

    // 查找对应的 chatId
    for (const [chatId, info] of sessionMap) {
      if (info.sessionId === sessionId) {
        try {
          // 发送回复到微信
          await adapter.sendText(chatId, text)

          // 标记消息已回复
          if (info.lastMessageId) {
            adapter.store.markReplied(info.lastMessageId, text)
          }
        } catch (err) {
          console.error(`[Reply] Failed to send to ${chatId}:`, err)
          if (info.lastMessageId) {
            adapter.store.markFailed(info.lastMessageId, String(err))
          }
        }
        break
      }
    }
  }

  // 注册消息处理回调
  adapter.onMessage = async (msg) => {
    const chatId = msg.roomId || msg.fromId

    // 计算消息 ID（与 MessageStore 内部逻辑一致）
    const messageId = adapter.store.getMessageId(
      config.path || 'default',
      msg.id,
    )

    // 查找或创建会话
    let info = sessionMap.get(chatId)
    if (!info) {
      const session = await sessionManager.createSession()
      info = { sessionId: session.id, lastMessageId: messageId }
      sessionMap.set(chatId, info)
      console.log(`[Router] New session ${session.id} for chat ${chatId}`)
    } else {
      // 更新最后一条消息 ID
      info.lastMessageId = messageId
    }

    // 构建发送内容（如果有对话历史，作为上下文追加）
    const content = typeof msg.content === 'string' ? msg.content : ''
    await sessionManager.sendMessage(info.sessionId, content)
  }

  // 初始化适配器
  try {
    await adapter.initialize()

    console.log('')
    console.log('✅ 初始化成功！')
    console.log('')
    console.log('请扫描上方二维码登录微信')
    console.log('登录成功后即可开始使用')
    console.log('')
    console.log('按 Ctrl+C 退出')
    console.log('')
  } catch (error) {
    console.error('❌ 初始化失败:', error)
    process.exit(1)
  }

  // 处理关闭信号
  const shutdown = async () => {
    console.log('\n正在关闭...')
    await adapter.stop()
    sessionManager.closeAll()
    console.log('已退出')
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // 定期清理过期会话映射
  setInterval(() => {
    const timeoutMs = config.session?.timeout ?? 30 * 60 * 1000
    const now = Date.now()
    for (const [chatId, info] of sessionMap) {
      const session = sessionManager.getSession(info.sessionId)
      if (!session || session.status !== 'connected') {
        sessionMap.delete(chatId)
      }
    }
  }, 60_000)

  // 保持运行
  await new Promise(() => {})
}

main().catch(console.error)
