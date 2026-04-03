/**
 * Wechaty Protocol Implementation
 *
 * This is a placeholder implementation. To use Wechaty, install:
 *   npm install wechaty wechaty-puppet-wechat qrcode-terminal
 *
 * For Padlocal protocol (more stable):
 *   npm install wechaty-puppet-padlocal
 */

import type { IWeChatProtocol, WeChatContact, WeChatRoom, WeChatRawMessage } from './protocol.js'

/**
 * Wechaty 协议实现（占位符）
 *
 * 实际使用时需要安装 wechaty 相关包
 */
export class WechatyProtocol implements IWeChatProtocol {
  readonly name = 'Wechaty'
  readonly type = 'wechaty' as const

  private loggedIn = false
  private qrCode: string | null = null
  private currentUser: WeChatContact | null = null

  private messageCallbacks: Array<(msg: WeChatRawMessage) => void> = []
  private loginCallbacks: Array<(user: WeChatContact) => void> = []
  private logoutCallbacks: Array<(reason: string) => void> = []

  private bot: any = null

  constructor(private puppet: 'wechat' | 'padlocal' = 'wechat') {}

  async initialize(): Promise<void> {
    try {
      // 动态导入 wechaty
      const { WechatyBuilder } = await import('wechaty')

      // 配置 puppet
      // wechaty-puppet-wechat 使用 Web 微信协议
      const puppetOptions = this.puppet === 'wechat'
        ? { puppet: 'wechaty-puppet-wechat' }
        : { puppet: 'wechaty-puppet-padlocal' }

      this.bot = WechatyBuilder.build({
        name: 'claude-code-bot',
        ...puppetOptions,
      })

      // 注册事件
      this.bot
        .on('scan', async (qrcode: string, status: string) => {
          // qrcode 可能已经是完整 URL，也可能是纯 ID
          const qrUrl = qrcode.startsWith('http')
            ? qrcode
            : `https://login.weixin.qq.com/l/${qrcode}`
          this.qrCode = qrUrl

          if (status === 'Waiting') {
            console.log(`[Wechaty] 请扫描二维码登录 (${status}):`)
            console.log(qrUrl)
          }

          // 生成终端二维码（使用原始 qrcode 内容）
          try {
            const qr = await import('qrcode-terminal')
            console.log('\n')
            qr.default.generate(qrcode, { small: true })
            console.log('\n')
          } catch {
            console.log('[Wechaty] 安装 qrcode-terminal 可显示终端二维码: npm install qrcode-terminal')
          }
        })
        .on('login', async (user: any) => {
          this.loggedIn = true
          this.currentUser = await this.convertContact(user)
          console.log(`[Wechaty] 登录成功: ${user.name()}`)
          this.loginCallbacks.forEach(cb => cb(this.currentUser!))
        })
        .on('logout', (_user: any, reason: string) => {
          this.loggedIn = false
          console.log(`[Wechaty] 已登出: ${reason}`)
          this.logoutCallbacks.forEach(cb => cb(reason))
        })
        .on('message', (msg: any) => {
          if (!this.loggedIn) return
          this.handleMessage(msg)
        })
        .on('error', (error: any) => {
          console.error('[Wechaty] Error:', error.message || error)
        })

      console.log(`[Wechaty] Initialized with puppet: ${this.puppet}`)
    } catch (error) {
      console.error('[Wechaty] Failed to initialize:', error)
      console.log('[Wechaty] Please install: npm install wechaty wechaty-puppet-wechat')
      throw error
    }
  }

  async start(): Promise<boolean> {
    if (!this.bot) {
      await this.initialize()
    }

    await this.bot.start()

    // 等待登录（最多 5 分钟）
    const timeout = 5 * 60 * 1000
    const start = Date.now()

    while (!this.loggedIn && Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 1000))
    }

    return this.loggedIn
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stop()
    }
  }

  isLoggedIn(): boolean {
    return this.loggedIn
  }

  async getQRCode(): Promise<string | Buffer | null> {
    return this.qrCode
  }

  async sendText(contactId: string, text: string): Promise<string> {
    const contact = await this.bot?.Contact?.find(contactId)
    if (!contact) throw new Error(`Contact not found: ${contactId}`)

    await contact.say(text)
    return `msg_${Date.now()}`
  }

  async sendImage(contactId: string, image: Buffer | string): Promise<string> {
    const contact = await this.bot?.Contact?.find(contactId)
    if (!contact) throw new Error(`Contact not found: ${contactId}`)

    const FileBox = this.bot.FileBox
    const fileBox = typeof image === 'string'
      ? FileBox.fromUrl(image)
      : FileBox.fromBuffer(image, 'image.jpg')

    await contact.say(fileBox)
    return `msg_${Date.now()}`
  }

  async sendFile(contactId: string, file: Buffer | string, name: string): Promise<string> {
    const contact = await this.bot?.Contact?.find(contactId)
    if (!contact) throw new Error(`Contact not found: ${contactId}`)

    const FileBox = this.bot.FileBox
    const fileBox = typeof file === 'string'
      ? FileBox.fromUrl(file, name)
      : FileBox.fromBuffer(file, name)

    await contact.say(fileBox)
    return `msg_${Date.now()}`
  }

  async getContact(contactId: string): Promise<WeChatContact> {
    const contact = await this.bot?.Contact?.find(contactId)
    if (!contact) throw new Error(`Contact not found: ${contactId}`)
    return this.convertContact(contact)
  }

  async getRoom(roomId: string): Promise<WeChatRoom> {
    const room = await this.bot?.Room?.find(roomId)
    if (!room) throw new Error(`Room not found: ${roomId}`)

    const members = await room.memberAll()

    return {
      id: room.id,
      name: await room.topic() || '未命名群',
      avatar: room.avatar()?.toString(),
      members: await Promise.all(members.map((m: any) => this.convertContact(m))),
      ownerId: room.owner()?.id || '',
    }
  }

  onMessage(callback: (message: WeChatRawMessage) => void): void {
    this.messageCallbacks.push(callback)
  }

  onLogin(callback: (user: WeChatContact) => void): void {
    this.loginCallbacks.push(callback)
  }

  onLogout(callback: (reason: string) => void): void {
    this.logoutCallbacks.push(callback)
  }

  private async handleMessage(msg: any): Promise<void> {
    // 忽略自己发送的消息
    if (msg.self()) return

    const rawMessage: WeChatRawMessage = {
      id: msg.id(),
      type: this.mapMessageType(msg.type()),
      fromId: msg.talker().id(),
      toId: msg.listener()?.id || '',
      roomId: msg.room()?.id,
      content: await msg.text(),
      timestamp: msg.date(),
    }

    this.messageCallbacks.forEach(cb => cb(rawMessage))
  }

  private mapMessageType(type: any): WeChatRawMessage['type'] {
    const MessageTypes = {
      Unknown: 0,
      Text: 1,
      Image: 3,
      Voice: 34,
      Video: 43,
      Emoji: 47,
      Location: 48,
      Link: 49,
    }

    const typeMap: Record<number, WeChatRawMessage['type']> = {
      [MessageTypes.Text]: 'text',
      [MessageTypes.Image]: 'image',
      [MessageTypes.Voice]: 'voice',
      [MessageTypes.Video]: 'video',
      [MessageTypes.Emoji]: 'emoji',
      [MessageTypes.Location]: 'location',
      [MessageTypes.Link]: 'link',
    }

    return typeMap[type] || 'unknown'
  }

  private async convertContact(contact: any): Promise<WeChatContact> {
    return {
      id: contact.id,
      name: contact.name() || contact.id,
      alias: contact.alias() || undefined,
      avatar: contact.avatar()?.toString(),
      gender: contact.gender() === 1 ? 'male' : contact.gender() === 2 ? 'female' : 'unknown',
      isFriend: contact.friend(),
      isBot: contact.type() === 1,
    }
  }
}
