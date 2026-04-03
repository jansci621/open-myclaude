/**
 * Feishu Platform Adapter (Official SDK)
 *
 * 使用飞书官方 SDK @larksuiteoapi/node-sdk
 * 文档: https://open.feishu.cn/document/client-docs/sdk/node-js-sdk
 */

import { BasePlatformAdapter } from '../adapter.js'
import type { PlatformConfig, UnifiedMessage, UnifiedResponse, UnifiedContent } from '../types.js'
import { messageRouter } from '../router.js'
import type { FeishuEvent } from './types.js'

// 飞书官方 SDK 类型
type LarkClient = any

/**
 * 飞书适配器（官方 SDK 版本）
 */
export class FeishuAdapter extends BasePlatformAdapter {
  readonly platformId = 'feishu' as const
  readonly platformName = '飞书'

  private client: LarkClient | null = null
  private wsClient: any = null
  private tenantAccessToken: string | null = null
  private tokenExpireAt: number = 0

  constructor(config: PlatformConfig) {
    super(config)
  }

  async initialize(): Promise<void> {
    await super.initialize()

    try {
      // 动态导入官方 SDK
      const { Client } = await import('@larksuiteoapi/node-sdk')

      // 创建客户端
      this.client = new Client({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        domain: 'https://open.feishu.cn',
      })

      console.log(`[Feishu] Initialized with official SDK`)
      console.log(`[Feishu] App ID: ${this.config.appId}`)

      // 启动 WebSocket 长连接
      const wsConfig = (this.config as any).websocket
      if (wsConfig?.enabled !== false) {
        await this.startWebSocket()
      }
    } catch (error) {
      console.error('[Feishu] Failed to initialize SDK:', error)
      throw error
    }
  }

  /**
   * 获取 tenant_access_token
   */
  private async ensureToken(): Promise<string> {
    if (this.tenantAccessToken && Date.now() < this.tokenExpireAt) {
      return this.tenantAccessToken
    }

    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }),
    })

    const data = await res.json() as { code: number; msg: string; tenant_access_token?: string; expire?: number }

    if (data.code !== 0) {
      throw new Error(`Failed to get token: ${data.msg}`)
    }

    this.tenantAccessToken = data.tenant_access_token!
    this.tokenExpireAt = Date.now() + (data.expire! - 60) * 1000

    console.log('[Feishu] Token obtained')
    return this.tenantAccessToken
  }

  /**
   * 启动 WebSocket 长连接
   */
  private async startWebSocket(): Promise<void> {
    try {
      console.log('[Feishu] Starting WebSocket long connection...')

      // 使用官方 SDK 的 WebSocket 客户端
      const { WSClient, EventDispatcher } = await import('@larksuiteoapi/node-sdk')

      // 创建事件分发器
      const eventDispatcher = new EventDispatcher({
        verificationToken: this.config.token || '',
      })

      // 注册消息事件处理器
      eventDispatcher.register({
        'im.message.receive_v1': async (data: any) => {
          console.log(`[Feishu WS] Message received`)
          await this.handleWsEvent(data)
        },
      })

      // 创建 WebSocket 客户端
      this.wsClient = new WSClient({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        domain: 'https://open.feishu.cn',
        loggerLevel: 'error',
        autoReconnect: true,
      })

      // 启动连接
      await this.wsClient.start({
        eventDispatcher,
      })

      console.log('[Feishu WS] Connected successfully ✅')
      console.log('[Feishu WS] Ready to receive events')

    } catch (error: any) {
      const errMsg = error?.message || String(error)

      if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('connect')) {
        console.log('')
        console.log('='.repeat(60))
        console.log('[Feishu WS] WebSocket 不可用 - 需要满足以下条件:')
        console.log('='.repeat(60))
        console.log('')
        console.log('  1. 应用必须发布到企业')
        console.log('     - 访问飞书开放平台: https://open.feishu.cn/')
        console.log('     - 在应用管理中发布应用到企业')
        console.log('')
        console.log('  2. 启用 WebSocket 能力')
        console.log('     - 在应用后台找到"事件订阅"')
        console.log('     - 开启"使用长连接接收事件"')
        console.log('')
        console.log('  当前将使用 Webhook 模式作为替代')
        console.log('  需要配置公网地址或使用内网穿透工具')
        console.log('')
        console.log('='.repeat(60))
      } else {
        console.error('[Feishu WS] Failed to start:', errMsg)
      }
    }
  }

  /**
   * 处理 WebSocket 事件
   */
  private async handleWsEvent(event: FeishuEvent): Promise<void> {
    // 详细日志，便于调试
    console.log('[Feishu WS] Raw event:', JSON.stringify(event).slice(0, 500))

    const eventType = event.header?.event_type || event.event_type || 'unknown'
    console.log(`[Feishu WS] Event type: ${eventType}`)

    // 处理消息事件
    if (eventType.startsWith('im.message') || eventType.includes('message')) {
      try {
        const message = await this.normalizeMessage(event)
        const contentPreview = typeof message.content === 'string'
          ? message.content.slice(0, 50)
          : '[rich content]'
        console.log(`[Feishu WS] Message from ${message.platformUserId}: ${contentPreview}`)

        await messageRouter.route(message)
      } catch (error) {
        console.error('[Feishu WS] Error processing message:', error)
      }
    }
  }

  /**
   * 验证飞书 Webhook 签名
   */
  async validateSignature(req: Request): Promise<boolean> {
    // 如果没有配置 token，跳过签名验证（测试模式）
    if (!this.config.token) {
      console.log('[Feishu] No token - skipping signature validation (test mode)')
      return true
    }

    const timestamp = req.headers.get('X-Lark-Request-Timestamp')
    const nonce = req.headers.get('X-Lark-Request-Nonce')
    const signature = req.headers.get('X-Lark-Signature')

    if (!timestamp || !nonce || !signature) {
      console.log('[Feishu] Missing signature headers')
      return false
    }

    // 防重放攻击：检查时间戳
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      console.log('[Feishu] Timestamp expired')
      return false
    }

    // 使用官方 SDK 验证签名
    try {
      const body = await req.clone().text()
      const isValid = this.client?.validateSignature({
        timestamp,
        nonce,
        token: this.config.token,
        body,
        signature,
      })
      return isValid ?? false
    } catch {
      return false
    }
  }

  /**
   * 处理 Webhook 请求
   */
  async handleWebhook(req: Request): Promise<Response> {
    console.log(`[Feishu] Webhook received: ${req.method}`)

    // 验证签名
    if (!await this.validateSignature(req)) {
      console.log('[Feishu] Invalid signature - rejecting')
      return new Response('Invalid signature', { status: 401 })
    }

    const body = await req.text()
    let parsed: any

    try {
      parsed = JSON.parse(body)
    } catch {
      console.error('[Feishu] Invalid JSON body')
      return new Response('Invalid JSON', { status: 400 })
    }

    // URL 验证
    if (parsed.type === 'url_verification') {
      console.log('[Feishu] URL verification request')
      console.log(`[Feishu] Challenge: ${parsed.challenge}`)
      return new Response(JSON.stringify({
        challenge: parsed.challenge,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 解析事件
    const event = parsed as FeishuEvent
    console.log(`[Feishu] Event type: ${event.header?.event_type || 'unknown'}`)

    // 只处理消息事件
    if (event.header?.event_type?.startsWith('im.message')) {
      try {
        const message = await this.normalizeMessage(event)
        console.log(`[Feishu] Message from ${message.platformUserId}: ${typeof message.content === 'string' ? message.content.slice(0, 50) : '...'}`)
        await messageRouter.route(message)
      } catch (error) {
        console.error('[Feishu] Error processing message:', error)
      }
    }

    return new Response('OK')
  }

  /**
   * 将飞书事件转换为统一消息
   */
  async normalizeMessage(event: FeishuEvent): Promise<UnifiedMessage> {
    // 兼容不同的事件结构
    const msgEvent = event.event || event.body || event
    const message = msgEvent.message || msgEvent

    // 获取发送者信息
    const sender = msgEvent.sender || {}
    const senderId = sender.sender_id || {}

    return {
      id: event.header?.event_id || event.event_id || Date.now().toString(),
      platform: 'feishu',
      platformMessageId: message.message_id || message.id,
      platformUserId: senderId.open_id || sender.open_id || 'unknown',
      platformChatId: message.chat_id || message.chatId || 'unknown',
      content: this.parseContent(message.message_type || 'text', message.content || ''),
      messageType: this.mapMessageType(message.message_type || 'text'),
      timestamp: new Date(parseInt(message.create_time || Date.now())),
      replyTo: message.parent_id || message.root_id,
      raw: event,
    }
  }

  /**
   * 发送响应到飞书
   */
  async sendResponse(chatId: string, response: UnifiedResponse): Promise<void> {
    let content: string
    let msgType: string

    if (typeof response.content === 'string') {
      content = JSON.stringify({ text: response.content })
      msgType = 'text'
    } else {
      content = JSON.stringify(this.buildPostContent(response.content))
      msgType = 'post'
    }

    try {
      // 获取 token
      const token = await this.ensureToken()

      // 直接调用 API 发送消息
      const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: msgType,
          content: content,
        }),
      })

      const data = await res.json() as { code: number; msg: string; data?: { message_id: string } }

      if (data.code !== 0) {
        throw new Error(`Feishu API error: ${data.code} - ${data.msg}`)
      }

      console.log(`[Feishu] Message sent to chat: ${chatId}, message_id: ${data.data?.message_id}`)
    } catch (error: any) {
      console.error(`[Feishu] Failed to send message: ${error.message}`)
      throw error
    }
  }

  /**
   * 解析消息内容
   */
  private parseContent(msgType: string, content: string): string | UnifiedContent[] {
    try {
      const parsed = JSON.parse(content)

      switch (msgType) {
        case 'text':
          return parsed.text || ''

        case 'post':
          return this.parsePostContent(parsed)

        case 'image':
          return [{ type: 'image', url: '', fileId: parsed.image_key }]

        case 'file':
          return [{ type: 'file', name: parsed.name || 'file', url: '', size: parsed.size }]

        default:
          return content
      }
    } catch {
      return content
    }
  }

  /**
   * 解析富文本内容
   */
  private parsePostContent(post: any): UnifiedContent[] {
    const contents: UnifiedContent[] = []
    const sections = post.zh_cn?.content || post.en_us?.content || []

    for (const section of sections) {
      for (const element of section) {
        if (element.tag === 'text') {
          contents.push({ type: 'text', text: element.text })
        } else if (element.tag === 'a') {
          contents.push({ type: 'text', text: `${element.text}(${element.href})` })
        }
      }
    }

    return contents
  }

  /**
   * 构建富文本内容
   */
  private buildPostContent(content: UnifiedContent[]): any {
    const sections: any[][] = []

    for (const item of content) {
      if (item.type === 'text') {
        sections.push([{ tag: 'text', text: item.text }])
      }
    }

    return {
      zh_cn: { content: sections },
    }
  }

  /**
   * 映射消息类型
   */
  private mapMessageType(msgType: string): UnifiedMessage['messageType'] {
    const map: Record<string, UnifiedMessage['messageType']> = {
      text: 'text',
      post: 'text',
      image: 'image',
      file: 'file',
      audio: 'audio',
      video: 'video',
    }
    return map[msgType] || 'text'
  }

  /**
   * 停止适配器
   */
  async stop(): Promise<void> {
    if (this.wsClient) {
      try {
        this.wsClient.close()
      } catch {}
      this.wsClient = null
    }
    this.client = null
    console.log('[Feishu] Adapter stopped')
  }
}
