/**
 * WeCom (企业微信) Platform Adapter
 */

import { BasePlatformAdapter } from '../adapter.js'
import type { PlatformConfig, UnifiedMessage, UnifiedResponse } from '../types.js'
import type {
  WeComCallbackMessage,
  WeComTokenResponse,
} from './types.js'
import { messageRouter } from '../router.js'
import * as crypto from 'crypto'

/**
 * 企业微信适配器
 */
export class WeComAdapter extends BasePlatformAdapter {
  readonly platformId = 'wechat' as const
  readonly platformName = '企业微信'

  private accessToken: string | null = null
  private tokenExpireAt: number = 0

  constructor(config: PlatformConfig) {
    super(config)
  }

  async initialize(): Promise<void> {
    await super.initialize()
    await this.getAccessToken()
    console.log(`[WeCom] Initialized with corp_id: ${this.config.appId}`)
  }

  /**
   * 验证企业微信 Webhook 签名
   */
  async validateSignature(req: Request): Promise<boolean> {
    const url = new URL(req.url)
    const msgSignature = url.searchParams.get('msg_signature')
    const timestamp = url.searchParams.get('timestamp')
    const nonce = url.searchParams.get('nonce')

    if (!msgSignature || !timestamp || !nonce) {
      console.log('[WeCom] Missing signature parameters')
      return false
    }

    const body = await req.clone().text()
    const arr = [this.config.token || '', timestamp, nonce, body].sort()
    const expectedSig = crypto.createHash('sha1').update(arr.join('')).digest('hex')

    return msgSignature === expectedSig
  }

  /**
   * 处理 Webhook 请求
   */
  async handleWebhook(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const echostr = url.searchParams.get('echostr')

    // URL 验证 (GET 请求)
    if (req.method === 'GET' && echostr) {
      if (!await this.validateSignature(req)) {
        return new Response('Invalid signature', { status: 401 })
      }
      // 解密 echostr 并返回
      try {
        const decrypted = this.decryptMessage(echostr)
        return new Response(decrypted)
      } catch (error) {
        console.error('[WeCom] Failed to decrypt echostr:', error)
        return new Response('Decrypt error', { status: 500 })
      }
    }

    // 消息处理 (POST 请求)
    if (!await this.validateSignature(req)) {
      return new Response('Invalid signature', { status: 401 })
    }

    const body = await req.text()
    try {
      const message = await this.parseEncryptedMessage(body)
      const unified = await this.normalizeMessage(message)

      await messageRouter.route(unified)
    } catch (error) {
      console.error('[WeCom] Error processing message:', error)
    }

    return new Response('success')
  }

  /**
   * 将企业微信消息转换为统一格式
   */
  async normalizeMessage(msg: WeComCallbackMessage): Promise<UnifiedMessage> {
    return {
      id: msg.MsgId,
      platform: 'wechat',
      platformMessageId: msg.MsgId,
      platformUserId: msg.FromUserName,
      platformChatId: msg.FromUserName, // 私聊

      content: msg.Content || '',
      messageType: this.mapMessageType(msg.MsgType),

      timestamp: new Date(msg.CreateTime * 1000),

      raw: msg,
    }
  }

  /**
   * 发送响应到企业微信
   */
  async sendResponse(chatId: string, response: UnifiedResponse): Promise<void> {
    const token = await this.ensureToken()

    const content = typeof response.content === 'string'
      ? response.content
      : response.content.map(c => c.type === 'text' ? c.text : '[附件]').join('')

    const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: chatId,
        msgtype: 'text',
        text: { content },
        agentid: this.config.appId,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`WeCom API error: ${res.status} - ${error}`)
    }

    console.log(`[WeCom] Message sent to user: ${chatId}`)
  }

  // ============ 私有方法 ============

  private decryptMessage(encrypted: string): string {
    const encodingAESKey = this.config.appSecret || ''
    const key = Buffer.from(encodingAESKey + '=', 'base64')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.slice(0, 16))
    decipher.setAutoPadding(false)

    let decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ])

    // 去除补齐字符
    const pad = decrypted[decrypted.length - 1]
    decrypted = decrypted.slice(20, decrypted.length - pad)

    return decrypted.toString('utf8')
  }

  private async parseEncryptedMessage(body: string): Promise<WeComCallbackMessage> {
    // 简化实现：从 XML 中提取加密内容并解密
    const encryptMatch = body.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/)
    if (!encryptMatch) {
      throw new Error('No encrypted content found')
    }

    const decrypted = this.decryptMessage(encryptMatch[1])
    return this.parseXml(decrypted)
  }

  private parseXml(xml: string): WeComCallbackMessage {
    // 简化的 XML 解析
    const getTag = (tag: string): string => {
      const match = xml.match(new RegExp(`<${tag}><!\[CDATA\[(.*?)\]\]></${tag}>`))
        || xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`))
      return match ? match[1] : ''
    }

    return {
      ToUserName: getTag('ToUserName'),
      FromUserName: getTag('FromUserName'),
      CreateTime: parseInt(getTag('CreateTime')) || 0,
      MsgType: getTag('MsgType') as WeComCallbackMessage['MsgType'],
      Content: getTag('Content'),
      MsgId: getTag('MsgId'),
      AgentID: getTag('AgentID'),
    }
  }

  private mapMessageType(type: string): UnifiedMessage['messageType'] {
    const map: Record<string, UnifiedMessage['messageType']> = {
      text: 'text',
      image: 'image',
      voice: 'audio',
      video: 'video',
      file: 'file',
    }
    return map[type] || 'text'
  }

  private async getAccessToken(): Promise<string> {
    const res = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.appId}&corpsecret=${this.config.appSecret}`,
    )

    const data = (await res.json()) as WeComTokenResponse

    if (data.errcode !== 0) {
      throw new Error(`Failed to get access token: ${data.errmsg}`)
    }

    this.accessToken = data.access_token
    this.tokenExpireAt = Date.now() + (data.expires_in - 60) * 1000

    return this.accessToken
  }

  private async ensureToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpireAt) {
      return this.getAccessToken()
    }
    return this.accessToken
  }
}
