/**
 * Personal WeChat Adapter
 *
 * 使用微信官方 iLink Bot API 实现扫码登录和消息收发
 */

import { BasePlatformAdapter } from '../adapter.js'
import type { UnifiedMessage, UnifiedResponse } from '../types.js'
import type { WeChatPersonalConfig, WeChatPersonalConfig as Config } from './types.js'
import type { IWeChatProtocol, WeChatRawMessage, WeChatContact } from './protocols/protocol.js'
import { ILinkProtocol } from './protocols/ilink.js'
import { MessageStore } from './message-store.js'

/**
 * 消息回调类型
 */
export type MessageCallback = (message: WeChatRawMessage) => void | Promise<void>

/**
 * 个人微信适配器
 */
export class WeChatPersonalAdapter extends BasePlatformAdapter {
  readonly platformId = 'wechat-personal' as const
  readonly platformName = '个人微信'

  private protocol: IWeChatProtocol | null = null
  private currentUser: WeChatContact | null = null
  private loginPromise: Promise<boolean> | null = null
  private messageCallbacks: MessageCallback[] = []
  readonly store: MessageStore

  /** 消息回调（外部可设置） */
  onMessage: MessageCallback | null = null

  /** 发送回复回调（SessionManager 回复时调用） */
  onSendReply: ((chatId: string, text: string) => Promise<void>) | null = null

  constructor(public config: WeChatPersonalConfig, runtimeDir?: string) {
    super(config)
    this.store = new MessageStore(runtimeDir)
  }

  async initialize(): Promise<void> {
    // 创建协议实例
    this.protocol = await this.createProtocol()

    // 注册回调
    this.protocol.onMessage(msg => this.handleMessage(msg))
    this.protocol.onLogin(user => this.handleLogin(user))
    this.protocol.onLogout(reason => this.handleLogout(reason))

    console.log(`[WeChat-Personal] Initialized with protocol: ${this.protocol.name}`)

    // 自动登录
    if ((this.config as Config).autoLogin) {
      this.loginPromise = this.login()
    }
  }

  /**
   * 启动并登录
   */
  async login(): Promise<boolean> {
    if (!this.protocol) {
      throw new Error('Protocol not initialized')
    }

    if (this.protocol.isLoggedIn()) {
      return true
    }

    console.log('[WeChat-Personal] Starting login...')

    try {
      const success = await this.protocol.start()

      if (!success) {
        console.error('[WeChat-Personal] Login failed or timeout')
        return false
      }

      return true
    } catch (error) {
      console.error('[WeChat-Personal] Login error:', error)
      return false
    }
  }

  /**
   * 获取登录二维码
   */
  async getQRCode(): Promise<string | Buffer | null> {
    return this.protocol?.getQRCode() || null
  }

  /**
   * 获取当前登录用户
   */
  getCurrentUser(): WeChatContact | null {
    return this.currentUser
  }

  /**
   * 是否已登录
   */
  isLoggedIn(): boolean {
    return this.protocol?.isLoggedIn() || false
  }

  /**
   * 验证签名（个人微信无此概念）
   */
  async validateSignature(req: Request): Promise<boolean> {
    return true
  }

  /**
   * 处理 Webhook（个人微信使用长连接，此接口返回状态）
   */
  async handleWebhook(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname.endsWith('/qrcode')) {
      const qr = await this.getQRCode()
      if (!qr) {
        return new Response('QR code not available', { status: 404 })
      }
      return new Response(qr instanceof Buffer ? qr : JSON.stringify({ qrcode: qr }), {
        headers: { 'Content-Type': qr instanceof Buffer ? 'image/png' : 'application/json' },
      })
    }

    if (url.pathname.endsWith('/status')) {
      return new Response(JSON.stringify({
        status: this.isLoggedIn() ? 'logged_in' : 'logged_out',
        user: this.currentUser,
        store: this.store.getStatus(),
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not found', { status: 404 })
  }

  /**
   * 转换消息
   */
  async normalizeMessage(raw: unknown): Promise<UnifiedMessage> {
    const msg = raw as WeChatRawMessage

    return {
      id: msg.id,
      platform: 'wechat-personal',
      platformMessageId: msg.id,
      platformUserId: msg.fromId,
      platformChatId: msg.roomId || msg.fromId,

      content: this.parseContent(msg),
      messageType: this.mapMessageType(msg.type),

      timestamp: msg.timestamp,

      raw: msg,
    }
  }

  /**
   * 发送响应
   */
  async sendResponse(chatId: string, response: UnifiedResponse): Promise<void> {
    if (!this.protocol?.isLoggedIn()) {
      throw new Error('Not logged in')
    }

    const content = typeof response.content === 'string'
      ? response.content
      : response.content.map(c => c.type === 'text' ? c.text : '[附件]').join('')

    await this.protocol.sendText(chatId, content)
    console.log(`[WeChat-Personal] Message sent to: ${chatId}`)
  }

  /**
   * 发送文本消息
   */
  async sendText(contactId: string, text: string): Promise<string> {
    if (!this.protocol?.isLoggedIn()) {
      throw new Error('Not logged in')
    }
    return this.protocol.sendText(contactId, text)
  }

  /**
   * 发送图片
   */
  async sendImage(contactId: string, image: Buffer | string): Promise<string> {
    if (!this.protocol?.isLoggedIn()) {
      throw new Error('Not logged in')
    }
    return this.protocol.sendImage(contactId, image)
  }

  /**
   * 发送文件
   */
  async sendFile(contactId: string, file: Buffer | string, name: string): Promise<string> {
    if (!this.protocol?.isLoggedIn()) {
      throw new Error('Not logged in')
    }
    return this.protocol.sendFile(contactId, file, name)
  }

  /**
   * 停止适配器
   */
  async stop(): Promise<void> {
    await this.protocol?.stop()
    this.store.close()
    console.log('[WeChat-Personal] Stopped')
  }

  // ============ 私有方法 ============

  private async createProtocol(): Promise<IWeChatProtocol> {
    const config = this.config as Config

    return new ILinkProtocol({
      baseUrl: config.ilinkBaseUrl,
      accountName: config.ilinkAccountName,
    })
  }

  private async handleMessage(msg: WeChatRawMessage): Promise<void> {
    // 消息过滤
    if (!this.shouldProcessMessage(msg)) {
      return
    }

    const chatId = msg.roomId || msg.fromId
    const text = this.parseContent(msg)
    if (!text) return

    // 持久化 + 去重
    const isNew = this.store.persistMessage({
      accountName: this.config.path || 'default',
      senderId: msg.fromId,
      senderName: msg.fromId.split('@')[0] || msg.fromId,
      chatId,
      text,
      rawMessageId: msg.id,
      contextToken: msg.metadata?.contextToken,
    })
    if (!isNew) return

    console.log(`[WeChat-Personal] [${msg.fromId}] ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`)

    // 调用外部回调
    if (this.onMessage) {
      await this.onMessage(msg)
    }

    // 内部消息回调
    for (const cb of this.messageCallbacks) {
      await cb(msg)
    }
  }

  private handleLogin(user: WeChatContact): void {
    this.currentUser = user
    console.log(`[WeChat-Personal] Logged in as: ${user.name} (${user.id})`)
  }

  private handleLogout(reason: string): void {
    this.currentUser = null
    console.log(`[WeChat-Personal] Logged out: ${reason}`)

    // 自动重连
    const config = this.config as Config
    if (config.reconnect?.enabled) {
      console.log(`[WeChat-Personal] Reconnecting in ${config.reconnect.interval}ms...`)
      setTimeout(() => {
        this.loginPromise = this.login()
      }, config.reconnect.interval)
    }
  }

  private shouldProcessMessage(msg: WeChatRawMessage): boolean {
    const config = this.config as Config
    const filter = config.filter

    if (!filter) return true

    // 检查用户白名单
    if (filter.allowedUsers?.length && !filter.allowedUsers.includes(msg.fromId)) {
      return false
    }

    // 检查群消息
    if (msg.roomId) {
      if (filter.ignoreRooms) return false
      if (filter.allowedRooms?.length && !filter.allowedRooms.includes(msg.roomId)) {
        return false
      }
    }

    return true
  }

  private parseContent(msg: WeChatRawMessage): string {
    switch (msg.type) {
      case 'text':
        return msg.content
      case 'image':
        return '[图片]'
      case 'voice':
        return '[语音]'
      case 'video':
        return '[视频]'
      case 'file':
        return `[文件: ${msg.file?.name || 'unknown'}]`
      case 'link':
        return '[链接]'
      case 'mini_program':
        return '[小程序]'
      case 'emoji':
        return '[表情]'
      case 'location':
        return '[位置]'
      case 'transfer':
        return '[转账]'
      case 'red_packet':
        return '[红包]'
      default:
        return msg.content || '[未知消息]'
    }
  }

  private mapMessageType(type: WeChatRawMessage['type']): UnifiedMessage['messageType'] {
    const map: Record<string, UnifiedMessage['messageType']> = {
      text: 'text',
      image: 'image',
      file: 'file',
      voice: 'audio',
      video: 'video',
    }
    return map[type] || 'text'
  }
}
