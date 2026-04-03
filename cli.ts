#!/usr/bin/env bun
/**
 * MyClaude Code Unified CLI Entry Point
 *
 * 统一的命令行入口，支持所有功能：
 *   - webchat    启动 Web 聊天界面
 *   - wechat     启动个人微信适配器（iLink Bot API）
 *   - platforms  启动多平台服务
 *   - feishu     快速启动飞书适配器
 *   - wecom      快速启动企业微信适配器
 *
 * Usage:
 *   myclaude webchat --port 3002 --host 0.0.0.0
 *   myclaude wechat --workspace ~/my-project
 *   myclaude platforms --feishu-app-id xxx
 *   myclaude --help
 */

import './src/macro-polyfill.js'

// ============================================
// 类型定义
// ============================================

import type { UnattendedModeConfig } from './src/types/unattended.js'

type Command = 'webchat' | 'web' | 'wechat' | 'wechat-personal' | 'platforms' | 'feishu' | 'wecom' | 'help'

type GlobalOptions = {
  verbose: boolean
  settings?: string
  permissionMode?: 'ask' | 'auto-approve' | 'auto-deny'
  unattended?: boolean
  unattendedConfig?: string
  allowedTools?: string[]
  deniedTools?: string[]
  maxDuration?: number
  maxToolCalls?: number
  protectedPaths?: string[]
}

// ============================================
// 帮助信息
// ============================================

function printHelp(): void {
  console.log(`
${'\x1b[1m'}MyClaude Code${'\x1b[0m'}

${'\x1b[1m'}用法:${'\x1b[0m'}
  myclaude <command> [options]

${'\x1b[1m'}命令:${'\x1b[0m'}
  webchat, web     启动 Web 聊天界面
  wechat           启动个人微信适配器（iLink Bot API）
  platforms        启动多平台服务
  feishu           快速启动飞书适配器
  wecom            快速启动企业微信适配器
  help             显示帮助信息

${'\x1b[1m'}Web Chat 选项:${'\x1b[0m'}
  -p, --port <number>       端口号 (默认: 8080)
  -h, --host <string>       绑定地址 (默认: localhost)
  -s, --settings <path>     模型配置文件路径
  --auth-token <string>     API 认证 token
  --permission-mode <mode>  权限模式: ask | auto-approve | auto-deny
  -v, --verbose             详细日志

${'\x1b[1m'}Unattended 模式选项:${'\x1b[0m'}
  --unattended              启用无人值守模式
  --unattended-config <path> 无人值守配置文件路径
  --allowed-tools <tools>   允许的工具 (逗号分隔)
  --denied-tools <tools>    禁止的工具 (逗号分隔)
  --max-duration <ms>       最大执行时长 (毫秒)
  --max-tool-calls <n>      最大工具调用次数
  --protected-paths <paths> 受保护路径 (逗号分隔)

${'\x1b[1m'}飞书选项:${'\x1b[0m'}
  --app-id <id>             飞书 App ID
  --app-secret <secret>     飞书 App Secret
  --token <token>           飞书验证 Token
  --no-websocket            禁用 WebSocket，使用 Webhook 模式

${'\x1b[1m'}企业微信选项:${'\x1b[0m'}
  --app-id <id>             企业微信 Corp ID
  --app-secret <secret>     企业微信 EncodingAESKey
  --token <token>           企业微信 Token

${'\x1b[1m'}个人微信选项:${'\x1b[0m'}
  --allow-user <wxid>       只处理指定用户消息
  --ignore-rooms            忽略群消息

${'\x1b[1m'}多平台选项:${'\x1b[0m'}
  --webchat                 启用 Web Chat 界面
  --feishu-app-id <id>      飞书 App ID
  --feishu-app-secret <sec> 飞书 App Secret
  --wechat-app-id <id>      企业微信 Corp ID
  --wechat-app-secret <sec> 企业微信 Corp Secret
  --wechat-personal         启用个人微信
  --config <path>           配置文件路径 (YAML)

${'\x1b[1m'}全局选项:${'\x1b[0m'}
  -s, --settings <path>     模型配置文件 (所有命令通用)
  --permission-mode <mode>  权限模式 (所有命令通用)
  -v, --verbose             详细日志
  --help                    显示帮助

${'\x1b[1m'}示例:${'\x1b[0m'}
  myclaude webchat --port 3002 --host 0.0.0.0
  myclaude feishu --app-id cli_xxx --app-secret xxx
  myclaude wechat --workspace ~/my-project
  myclaude platforms --config platforms.yaml
  myclaude platforms --webchat --port 8080 \\
    --feishu-app-id cli_xxx --feishu-app-secret xxx
`)
}

// ============================================
// 参数解析
// ============================================

function parseArgs(args: string[]): { command: Command; options: Record<string, any>; remaining: string[] } {
  const globalOptions: GlobalOptions = {
    verbose: false,
  }
  const options: Record<string, any> = {}
  const remaining: string[] = []

  let i = 0
  while (i < args.length) {
    const arg = args[i]

    // 全局选项
    if (arg === '--verbose' || arg === '-v') {
      globalOptions.verbose = true
      options.verbose = true
      i++
    } else if (arg === '--settings' || arg === '-s') {
      globalOptions.settings = args[++i]
      options.settingsPath = globalOptions.settings
      i++
    } else if (arg === '--permission-mode') {
      globalOptions.permissionMode = args[++i] as any
      options.permissionMode = globalOptions.permissionMode
      i++
    } else if (arg === '--no-websocket') {
      options.noWebsocket = true
      i++
    } else if (arg === '--help' || arg === '-h') {
      return { command: 'help', options: {}, remaining: [] }
    }
    // Unattended 模式选项
    else if (arg === '--unattended') {
      globalOptions.unattended = true
      options.unattended = true
      i++
    } else if (arg === '--unattended-config') {
      globalOptions.unattendedConfig = args[++i]
      options.unattendedConfigPath = globalOptions.unattendedConfig
      i++
    } else if (arg === '--allowed-tools') {
      globalOptions.allowedTools = args[++i].split(',').map(s => s.trim())
      options.allowedTools = globalOptions.allowedTools
      i++
    } else if (arg === '--denied-tools') {
      globalOptions.deniedTools = args[++i].split(',').map(s => s.trim())
      options.deniedTools = globalOptions.deniedTools
      i++
    } else if (arg === '--max-duration') {
      globalOptions.maxDuration = parseInt(args[++i], 10)
      options.maxDuration = globalOptions.maxDuration
      i++
    } else if (arg === '--max-tool-calls') {
      globalOptions.maxToolCalls = parseInt(args[++i], 10)
      options.maxToolCalls = globalOptions.maxToolCalls
      i++
    } else if (arg === '--protected-paths') {
      globalOptions.protectedPaths = args[++i].split(',').map(s => s.trim())
      options.protectedPaths = globalOptions.protectedPaths
      i++
    }
    // 端口
    else if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10)
      i++
    }
    // 主机
    else if (arg === '--host') {
      options.host = args[++i]
      i++
    }
    // 其他选项
    else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      const value = args[i + 1]
      if (value && !value.startsWith('-')) {
        options[key] = value
        i += 2
      } else {
        options[key] = true
        i++
      }
    }
    // 命令或剩余参数
    else if (!arg.startsWith('-') && i === 0) {
      // 第一个非选项参数是命令
      remaining.push(arg)
      i++
    } else {
      remaining.push(arg)
      i++
    }
  }

  const command = (remaining[0] as Command) || 'help'
  return { command, options: { ...globalOptions, ...options }, remaining: remaining.slice(1) }
}

// ============================================
// 命令处理
// ============================================

async function loadUnattendedConfig(options: Record<string, any>): Promise<UnattendedModeConfig | undefined> {
  const { createDefaultUnattendedModeConfig } = await import('./src/types/unattended.js')

  // 如果指定了配置文件，从文件加载
  if (options.unattendedConfigPath) {
    try {
      const fs = await import('fs/promises')
      const content = await fs.readFile(options.unattendedConfigPath, 'utf-8')
      const config = JSON.parse(content) as UnattendedModeConfig
      console.log(`[Unattended] 加载配置文件: ${options.unattendedConfigPath}`)
      return config
    } catch (error) {
      console.error(`[Unattended] 无法加载配置文件: ${error}`)
      process.exit(1)
    }
  }

  // 如果启用了 unattended 但没有配置文件，使用命令行参数
  if (options.unattended) {
    const config = createDefaultUnattendedModeConfig()
    config.enabled = true

    // 命令行参数覆盖默认配置
    if (options.allowedTools?.length) {
      config.boundaries.allowedTools = options.allowedTools
    }
    if (options.deniedTools?.length) {
      config.boundaries.deniedTools = options.deniedTools
    }
    if (options.maxDuration) {
      config.execution.maxDuration = options.maxDuration
    }
    if (options.maxToolCalls) {
      config.execution.maxToolCalls = options.maxToolCalls
    }
    if (options.protectedPaths?.length) {
      config.boundaries.protectedPaths = [...config.boundaries.protectedPaths, ...options.protectedPaths]
    }

    console.log('[Unattended] 无人值守模式已启用')
    if (options.allowedTools) {
      console.log(`[Unattended] 允许的工具: ${options.allowedTools.join(', ')}`)
    }
    if (options.deniedTools) {
      console.log(`[Unattended] 禁止的工具: ${options.deniedTools.join(', ')}`)
    }

    return config
  }

  return undefined
}

async function runWebchat(options: Record<string, any>): Promise<void> {
  const { parseConfig, validateConfig, printConfig } = await import('./src/webchat/config.js')
  const { WebChatServer } = await import('./src/webchat/server.js')

  // 加载 unattended 配置
  const unattendedConfig = await loadUnattendedConfig(options)

  const config = parseConfig({
    ...options,
    unattended: unattendedConfig,
  })
  const error = validateConfig(config)

  if (error) {
    console.error(`配置错误: ${error}`)
    process.exit(1)
  }

  if (config.verbose) {
    printConfig(config)
  }

  const server = new WebChatServer(config)

  const shutdown = async () => {
    console.log('\n正在关闭...')
    await server.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await server.start()
  console.log(`\n✅ Web Chat 已启动`)
  console.log(`   访问: http://${config.host}:${config.port}`)
  if (unattendedConfig?.enabled) {
    console.log(`   模式: 无人值守`)
  }
}

async function runWechatPersonal(options: Record<string, any>): Promise<void> {
  const { WeChatPersonalAdapter } = await import('./src/platforms/wechat-personal/adapter.js')
  const { messageRouter } = await import('./src/platforms/router.js')
  const { WebChatSessionManager } = await import('./src/webchat/sessionManager.js')
  const { DEFAULT_WECHAT_PERSONAL_CONFIG } = await import('./src/platforms/wechat-personal/types.js')

  const config = {
    ...DEFAULT_WECHAT_PERSONAL_CONFIG,
    ...options,
    enabled: true,
    path: '/wechat',
    puppet: options.puppet || 'wechat',
    autoLogin: true,
    loginTimeout: 300,
    reconnect: {
      enabled: true,
      maxRetries: 10,
      interval: 5000,
    },
    filter: {
      ignoreRooms: options.ignoreRooms || false,
      ignoreOfficial: true,
      allowedUsers: options.allowUser ? [options.allowUser] : undefined,
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
  }

  console.log('═'.repeat(50))
  console.log('  个人微信适配器 - MyClaude Code')
  console.log('═'.repeat(50))
  console.log('')
  console.log('  使用微信官方 iLink Bot API')
  console.log('  首次使用需扫码登录')
  console.log('')

  // 创建 Session Manager
  const sessionManager = new WebChatSessionManager({
    port: 0,
    host: 'localhost',
    corsOrigins: ['*'],
    maxSessions: 100,
    sessionTimeoutMs: 30 * 60 * 1000,
    permissionMode: 'auto-approve',
    verbose: false,
    settingsPath: options.settingsPath,
  }, {
    onMessage: () => {},
    onMessageUpdate: () => {},
    onStreamDelta: () => {},
    onThinking: () => {},
    onToolUse: () => {},
    onToolResult: () => {},
    onPermissionRequest: (sessionId, request) => {
      sessionManager.respondToPermission(sessionId, request.requestId, true)
    },
    onStatusChange: () => {},
    onError: (sessionId, error) => console.error(`[Session ${sessionId}] Error:`, error.message),
  })

  messageRouter.setSessionManager(sessionManager)

  const adapter = new WeChatPersonalAdapter(config as any)
  const sessionMap = new Map<string, string>()

  adapter.onMessage = async (msg) => {
    const chatId = msg.roomId || msg.fromId
    let sessionId = sessionMap.get(chatId)

    if (!sessionId) {
      const session = await sessionManager.createSession()
      sessionId = session.id
      sessionMap.set(chatId, sessionId)
      console.log(`[Router] 新会话 ${sessionId} -> ${chatId}`)
    }

    const content = typeof msg.content === 'string' ? msg.content : ''
    await sessionManager.sendMessage(sessionId, content)
  }

  try {
    await adapter.initialize()
    console.log('\n✅ 初始化成功，请扫描二维码登录')
  } catch (error) {
    console.error('❌ 初始化失败:', error)
    console.log('\n请确保已安装依赖:')
    console.log('  npm install wechaty wechaty-puppet-wechat qrcode-terminal')
    process.exit(1)
  }

  const shutdown = async () => {
    console.log('\n正在关闭...')
    await adapter.stop()
    sessionManager.closeAll()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await new Promise(() => {})
}

async function runPlatforms(options: Record<string, any>): Promise<void> {
  const { startMultiPlatformServer } = await import('./src/platforms/server.js')
  const { DEFAULT_CONFIG } = await import('./src/webchat/config.js')

  const config = {
    port: options.port || 8080,
    host: options.host || '0.0.0.0',
    settingsPath: options.settingsPath,
    permissionMode: options.permissionMode || 'ask',
    verbose: options.verbose || false,
    webchatEnabled: options.webchat === true,  // Web Chat 界面
    platforms: {} as Record<string, any>,
  }

  // 飞书
  if (options.feishuAppId) {
    config.platforms.feishu = {
      enabled: true,
      path: '/webhook/feishu',
      appId: options.feishuAppId,
      appSecret: options.feishuAppSecret,
      token: options.feishuToken,
      websocket: {
        enabled: options.noWebsocket !== true,  // 默认启用 WebSocket
        reconnect: true,
        reconnectInterval: 5000,
        heartbeatInterval: 30000,
      },
      features: { streaming: false, richText: true, file: true, mention: true },
      session: { createOnMessage: true, timeout: 1800000, maxPerUser: 5 },
    }
  }

  // 企业微信
  if (options.wechatAppId) {
    config.platforms.wechat = {
      enabled: true,
      path: '/webhook/wechat',
      appId: options.wechatAppId,
      appSecret: options.wechatAppSecret,
      token: options.wechatToken,
      features: { streaming: false, richText: false, file: true, mention: true },
      session: { createOnMessage: true, timeout: 1800000, maxPerUser: 5 },
    }
  }

  // 个人微信
  if (options.wechatPersonal) {
    config.platforms['wechat-personal'] = {
      enabled: true,
      path: '/webhook/wechat-personal',
      protocol: options.wechatProtocol || options.protocol || 'wechaty',
      puppet: options.wechatPuppet || options.puppet || 'wechat',
      autoLogin: true,
      loginTimeout: 300,
      reconnect: { enabled: true, maxRetries: 10, interval: 5000 },
      filter: {
        ignoreRooms: options.ignoreRooms || false,
        ignoreOfficial: true,
        allowedUsers: options.allowUser ? [options.allowUser] : undefined,
      },
      features: { streaming: false, richText: false, file: true, mention: true },
      session: { createOnMessage: true, timeout: 1800000, maxPerUser: 5 },
    }
  }

  const enabledCount = Object.values(config.platforms).filter((p: any) => p.enabled).length

  // 检查是否启用任何功能：webchat 或平台
  if (enabledCount === 0 && !config.webchatEnabled) {
    console.error('错误: 未启用任何功能')
    console.log('\n使用 --help 查看帮助')
    console.log('\n快速启动:')
    console.log('  仅 Web Chat:  myclaude platforms --webchat')
    console.log('  Web + 飞书:   myclaude platforms --webchat --feishu-app-id xxx --feishu-app-secret xxx')
    process.exit(1)
  }

  await startMultiPlatformServer(config)
}

async function runFeishu(options: Record<string, any>): Promise<void> {
  await runPlatforms({
    ...options,
    webchat: true,  // 飞书模式默认启用 Web Chat
    feishuAppId: options.appId || process.env.FEISHU_APP_ID,
    feishuAppSecret: options.appSecret || process.env.FEISHU_APP_SECRET,
    feishuToken: options.token || process.env.FEISHU_TOKEN,
  })
}

async function runWecom(options: Record<string, any>): Promise<void> {
  await runPlatforms({
    ...options,
    webchat: true,  // 企业微信模式默认启用 Web Chat
    wechatAppId: options.appId || process.env.WECOM_APP_ID,
    wechatAppSecret: options.appSecret || process.env.WECOM_APP_SECRET,
    wechatToken: options.token || process.env.WECOM_TOKEN,
  })
}

function isWechatWebchatMode(command: Command, options: Record<string, any>, remaining: string[]): boolean {
  if (command !== 'wechat' && command !== 'wechat-personal') {
    return false
  }

  return options.webchat === true || remaining.includes('webchat') || remaining.includes('web')
}

// ============================================
// 主函数
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // 检查是否为 print 模式（用于 WebChat 子进程）
  // print 模式需要委托给原始 CLI 入口点
  if (args.includes('--print') || args.includes('--input-format') || args.includes('--output-format')) {
    // 委托给原始 CLI 入口点
    const { spawn } = await import('child_process')
    const path = await import('path')
    const { fileURLToPath } = await import('url')

    // 找到 main.tsx 的路径
    const currentDir = path.dirname(fileURLToPath(import.meta.url))

    // 尝试找到包根目录（包含 tsconfig.json 的目录）
    let packageRoot = currentDir
    for (let i = 0; i < 10; i++) {
      const tsconfigPath = path.join(packageRoot, 'tsconfig.json')
      try {
        const fs = await import('fs')
        if (fs.existsSync(tsconfigPath)) {
          break
        }
      } catch {}
      const parent = path.dirname(packageRoot)
      if (parent === packageRoot) break
      packageRoot = parent
    }

    const mainPath = path.join(packageRoot, 'src', 'main.tsx')

    // 用 spawn 运行 main.tsx 并管道所有 I/O
    // 设置 cwd 为包根目录，让 bun 能正确解析 src/ 路径别名
    const child = spawn('bun', [mainPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],  // 管道 stdin/stdout/stderr
      cwd: packageRoot,  // 设置工作目录为包根目录
      env: {
        ...process.env,
        CLAUDE_CODE_SESSION_ID: process.env.CLAUDE_CODE_SESSION_ID,
      },
    })

    // 管道 stdin
    process.stdin.pipe(child.stdin)

    // 管道 stdout
    child.stdout.pipe(process.stdout)

    // 管道 stderr
    child.stderr.pipe(process.stderr)

    child.on('close', (code) => {
      process.exit(code ?? 0)
    })

    child.on('error', (err) => {
      console.error('Failed to run print mode:', err.message)
      process.exit(1)
    })

    // 保持进程运行
    return new Promise(() => {})
  }

  const { command, options, remaining } = parseArgs(args)

  if (isWechatWebchatMode(command, options, remaining)) {
    await runPlatforms({
      ...options,
      webchat: true,
      wechatPersonal: true,
    })
    return
  }

  switch (command) {
    case 'webchat':
    case 'web':
      await runWebchat(options)
      break

    case 'wechat':
    case 'wechat-personal':
      await runWechatPersonal(options)
      break

    case 'platforms':
      await runPlatforms(options)
      break

    case 'feishu':
      await runFeishu(options)
      break

    case 'wecom':
      await runWecom(options)
      break

    case 'help':
    default:
      printHelp()
      break
  }
}

main().catch((err) => {
  console.error('错误:', err.message)
  process.exit(1)
})
