/**
 * iLink Bot API Protocol Implementation
 *
 * 使用微信官方 iLink Bot API 实现扫码登录和消息收发。
 * 参考 wechat-mcp-claude 项目的 wechat-api.ts 实现。
 *
 * API 文档：
 *   GET  {base}/ilink/bot/get_bot_qrcode?bot_type=3     获取 QR 码
 *   GET  {base}/ilink/bot/get_qrcode_status?qrcode={qr}  轮询 QR 状态
 *   POST {base}/ilink/bot/getupdates                      长轮询获取消息
 *   POST {base}/ilink/bot/sendmessage                     发送消息
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IWeChatProtocol, WeChatContact, WeChatRoom, WeChatRawMessage } from './protocol.js'

// ── 常量 ──────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'
const LONG_POLL_TIMEOUT_MS = 35_000
const BOT_TYPE = '3'
const BRIDGE_VERSION = '2.0.0'
const MSG_TYPE_USER = 1
const MSG_TYPE_BOT = 2
const MSG_STATE_FINISH = 2
const MSG_ITEM_TEXT = 1
const MSG_ITEM_VOICE = 3

const CREDENTIALS_DIR = path.join(
  process.env.HOME || '~',
  '.claude',
  'channels',
  'wechat-personal',
  'accounts',
)

// ── iLink 类型 ────────────────────────────────────────────────────────────

interface ILinkAccount {
  token: string
  baseUrl: string
  accountId: string
  userId?: string
  savedAt: string
}

interface QRCodeResponse {
  qrcode?: string
  qrcode_img_content?: string
  ret?: number
  errmsg?: string
}

interface QRStatusResponse {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired'
  bot_token?: string
  ilink_bot_id?: string
  ilink_user_id?: string
  baseurl?: string
}

interface TextItem {
  text?: string
}

interface MessageItem {
  type?: number
  text_item?: TextItem
  voice_item?: { text?: string }
  ref_msg?: { title?: string }
}

interface WeixinMessage {
  from_user_id?: string
  to_user_id?: string
  client_id?: string
  session_id?: string
  message_type?: number
  message_state?: number
  item_list?: MessageItem[]
  context_token?: string
  create_time_ms?: number
}

interface GetUpdatesResp {
  ret?: number
  errcode?: number
  errmsg?: string
  msgs?: WeixinMessage[]
  get_updates_buf?: string
  longpolling_timeout_ms?: number
}

// ── ILinkProtocol ─────────────────────────────────────────────────────────

export class ILinkProtocol implements IWeChatProtocol {
  readonly name = 'iLink'
  readonly type = 'ilink' as const

  private account: ILinkAccount | null = null
  private accountName: string
  private baseUrl: string
  private loggedIn = false
  private stopped = true

  // 消息轮询状态
  private syncBuf = ''
  private polling = false
  private syncBufPath: string

  // 回调
  private messageCallbacks: Array<(msg: WeChatRawMessage) => void> = []
  private loginCallbacks: Array<(user: WeChatContact) => void> = []
  private logoutCallbacks: Array<(reason: string) => void> = []

  // context_token 缓存：contactId → contextToken
  private contextTokenMap = new Map<string, string>()

  constructor(config?: { baseUrl?: string; accountName?: string }) {
    this.baseUrl = config?.baseUrl || DEFAULT_BASE_URL
    this.accountName = config?.accountName || 'default'
    this.syncBufPath = path.join(
      path.dirname(CREDENTIALS_DIR),
      `${this.accountName}.syncbuf`,
    )
  }

  // ── IWeChatProtocol 接口 ─────────────────────────────────────────────

  async initialize(): Promise<void> {
    // 尝试加载已保存的账号
    this.account = this.loadAccount()
    if (this.account) {
      this.loggedIn = true
      this.baseUrl = this.account.baseUrl
      this.syncBuf = this.loadSyncBuf()
      console.log(`[iLink] 已加载账号: ${this.account.accountId}`)
    }
  }

  async start(): Promise<boolean> {
    this.stopped = false

    // 已有 token，直接启动轮询
    if (this.account?.token) {
      this.loggedIn = true
      this.startPolling()
      return true
    }

    // 走 QR 扫码流程
    const account = await this.doQRLogin()
    if (!account) {
      return false
    }

    this.account = account
    this.loggedIn = true
    this.saveAccount(account)
    this.startPolling()
    return true
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.polling = false
    this.loggedIn = false
  }

  isLoggedIn(): boolean {
    return this.loggedIn
  }

  async getQRCode(): Promise<string | Buffer | null> {
    try {
      const resp = await this.fetchQRCode()
      return resp.qrcode_img_content || resp.qrcode || null
    } catch {
      return null
    }
  }

  async sendText(contactId: string, text: string): Promise<string> {
    if (!this.account) throw new Error('Not logged in')

    const contextToken = this.contextTokenMap.get(contactId) || ''
    const clientId = `ilink:${Date.now()}-${crypto.randomBytes(4).toString('hex')}`

    await this.apiFetch({
      endpoint: 'ilink/bot/sendmessage',
      body: JSON.stringify({
        msg: {
          from_user_id: '',
          to_user_id: contactId,
          client_id: clientId,
          message_type: MSG_TYPE_BOT,
          message_state: MSG_STATE_FINISH,
          item_list: [{ type: MSG_ITEM_TEXT, text_item: { text } }],
          context_token: contextToken,
        },
        base_info: { channel_version: BRIDGE_VERSION },
      }),
      token: this.account.token,
      timeoutMs: 15_000,
    })

    return clientId
  }

  async sendImage(_contactId: string, _image: Buffer | string): Promise<string> {
    throw new Error('iLink protocol does not support image sending')
  }

  async sendFile(_contactId: string, _file: Buffer | string, _name: string): Promise<string> {
    throw new Error('iLink protocol does not support file sending')
  }

  async getContact(contactId: string): Promise<WeChatContact> {
    return {
      id: contactId,
      name: contactId.split('@')[0] || contactId,
      isFriend: true,
      isBot: false,
    }
  }

  async getRoom(roomId: string): Promise<WeChatRoom> {
    return {
      id: roomId,
      name: roomId,
      members: [],
      ownerId: '',
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

  // ── QR 扫码登录 ─────────────────────────────────────────────────────

  private async doQRLogin(): Promise<ILinkAccount | null> {
    const totalDeadline = Date.now() + 600_000 // 10 分钟总超时

    while (Date.now() < totalDeadline && !this.stopped) {
      console.log('[iLink] 正在获取登录二维码...')
      let qrResp: QRCodeResponse

      try {
        qrResp = await this.fetchQRCode()
      } catch (err) {
        console.error('[iLink] 获取二维码失败:', err)
        await this.sleep(3000)
        continue
      }

      const qrContent = qrResp.qrcode_img_content || qrResp.qrcode
      if (!qrContent || !qrResp.qrcode) {
        console.error('[iLink] 二维码内容为空')
        await this.sleep(3000)
        continue
      }

      // 显示二维码
      console.log(`[iLink] 请扫描二维码登录:`)
      const qrUrl = qrContent.startsWith('http') ? qrContent : `https://login.weixin.qq.com/l/${qrContent}`
      console.log(qrUrl)

      try {
        const qr = await import('qrcode-terminal')
        console.log('\n')
        qr.default.generate(qrContent, { small: true })
        console.log('\n')
      } catch {
        console.log('[iLink] 安装 qrcode-terminal 可显示终端二维码: npm install qrcode-terminal')
      }

      // 轮询状态
      const qrDeadline = Date.now() + 480_000
      let scannedPrinted = false
      let needRefresh = false

      while (Date.now() < qrDeadline && Date.now() < totalDeadline && !this.stopped) {
        let status: QRStatusResponse
        try {
          status = await this.pollQRStatus(qrResp.qrcode!)
        } catch {
          await this.sleep(2000)
          continue
        }

        switch (status.status) {
          case 'wait':
            process.stdout.write('.')
            break
          case 'scaned':
            if (!scannedPrinted) {
              console.log('\n[iLink] 已扫码，请在微信中确认...')
              scannedPrinted = true
            }
            break
          case 'confirmed': {
            if (!status.ilink_bot_id || !status.bot_token) {
              console.error('\n[iLink] 登录失败：服务器未返回完整信息')
              return null
            }
            console.log('\n[iLink] 登录成功！')

            const user: WeChatContact = {
              id: status.ilink_bot_id,
              name: `iLink Bot (${status.ilink_bot_id})`,
              isFriend: false,
              isBot: true,
            }
            this.loginCallbacks.forEach(cb => cb(user))

            return {
              token: status.bot_token,
              baseUrl: status.baseurl || this.baseUrl,
              accountId: status.ilink_bot_id,
              userId: status.ilink_user_id,
              savedAt: new Date().toISOString(),
            }
          }
          case 'expired':
            console.log('\n[iLink] 二维码已过期，正在刷新...')
            needRefresh = true
            break
        }

        if (needRefresh) break

        await this.sleep(2000)
      }

      if (!needRefresh && Date.now() >= qrDeadline) {
        console.log('\n[iLink] 二维码超时，正在刷新...')
      }
    }

    console.log('[iLink] 登录超时')
    return null
  }

  // ── 消息轮询 ─────────────────────────────────────────────────────────

  private startPolling(): void {
    if (this.polling) return
    this.polling = true
    this.pollLoop()
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopped && this.loggedIn) {
      try {
        const response = await this.getUpdates()

        // 检查错误
        if (
          (response.ret !== undefined && response.ret !== 0) ||
          (response.errcode !== undefined && response.errcode !== 0)
        ) {
          const errcode = response.errcode
          if (errcode === -14) {
            console.error('[iLink] Token 无效或已过期，请重新登录')
            this.loggedIn = false
            this.logoutCallbacks.forEach(cb => cb('Token expired'))
            return
          }
          console.error(`[iLink] getUpdates 错误: ret=${response.ret} errcode=${errcode}`)
          await this.sleep(3000)
          continue
        }

        // 更新同步缓冲区
        if (response.get_updates_buf) {
          this.syncBuf = response.get_updates_buf
          this.saveSyncBuf(this.syncBuf)
        }

        // 处理消息
        const msgs = response.msgs ?? []
        for (const msg of msgs) {
          if (!this.isUserMessage(msg)) continue
          const text = this.extractText(msg)
          if (!text) continue

          // 缓存 context_token
          if (msg.context_token && msg.from_user_id) {
            this.contextTokenMap.set(msg.from_user_id, msg.context_token)
          }

          // 转换为 WeChatRawMessage 并触发回调
          const raw = this.convertMessage(msg, text)
          this.messageCallbacks.forEach(cb => cb(raw))
        }

        if (msgs.length > 0) {
          console.log(`[iLink] 收到 ${msgs.length} 条消息`)
        }
      } catch (err) {
        if (!this.stopped) {
          console.error('[iLink] 轮询异常:', err instanceof Error ? err.message : err)
          await this.sleep(5000)
        }
      }
    }
  }

  // ── iLink API 调用 ───────────────────────────────────────────────────

  private async fetchQRCode(): Promise<QRCodeResponse> {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`
    const url = `${base}ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`获取二维码失败: HTTP ${res.status}`)
    return (await res.json()) as QRCodeResponse
  }

  private async pollQRStatus(qrcode: string): Promise<QRStatusResponse> {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`
    const url = `${base}ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), LONG_POLL_TIMEOUT_MS)

    try {
      const res = await fetch(url, {
        headers: { 'iLink-App-ClientVersion': '1' },
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`状态查询失败: HTTP ${res.status}`)
      return (await res.json()) as QRStatusResponse
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof Error && err.name === 'AbortError') {
        return { status: 'wait' }
      }
      throw err
    }
  }

  private async getUpdates(): Promise<GetUpdatesResp> {
    const raw = await this.apiFetch({
      endpoint: 'ilink/bot/getupdates',
      body: JSON.stringify({
        get_updates_buf: this.syncBuf,
        base_info: { channel_version: BRIDGE_VERSION },
      }),
      token: this.account?.token,
      timeoutMs: LONG_POLL_TIMEOUT_MS,
    })
    return JSON.parse(raw) as GetUpdatesResp
  }

  private async apiFetch(params: {
    endpoint: string
    body: string
    token?: string
    timeoutMs: number
  }): Promise<string> {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`
    const url = new URL(params.endpoint, base).toString()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), params.timeoutMs)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(params.token, params.body),
        body: params.body,
        signal: controller.signal,
      })
      const text = await res.text()
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text}`)
      }
      return text
    } finally {
      clearTimeout(timer)
    }
  }

  private buildHeaders(token?: string, body?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': this.randomUin(),
    }

    if (body) {
      headers['Content-Length'] = String(Buffer.byteLength(body, 'utf-8'))
    }

    if (token?.trim()) {
      headers.Authorization = `Bearer ${token.trim()}`
    }

    return headers
  }

  // ── 消息转换 ─────────────────────────────────────────────────────────

  private isUserMessage(msg: WeixinMessage): boolean {
    return msg.message_type === MSG_TYPE_USER
  }

  private extractText(msg: WeixinMessage): string {
    if (!msg.item_list?.length) return ''

    for (const item of msg.item_list) {
      if (item.type === MSG_ITEM_TEXT && item.text_item?.text) {
        if (!item.ref_msg?.title) {
          return item.text_item.text
        }
        return `[引用: ${item.ref_msg.title}]\n${item.text_item.text}`
      }

      if (item.type === MSG_ITEM_VOICE && item.voice_item?.text) {
        return item.voice_item.text
      }
    }

    return ''
  }

  private convertMessage(msg: WeixinMessage, text: string): WeChatRawMessage {
    return {
      id: msg.client_id || `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      type: 'text',
      fromId: msg.from_user_id || 'unknown',
      toId: msg.to_user_id || '',
      roomId: undefined,
      content: text,
      timestamp: new Date(msg.create_time_ms ?? Date.now()),
      metadata: {
        contextToken: msg.context_token || '',
        sessionId: msg.session_id || '',
      },
    }
  }

  // ── 账号持久化 ───────────────────────────────────────────────────────

  private accountPath(): string {
    return path.join(CREDENTIALS_DIR, `${this.accountName}.json`)
  }

  private loadAccount(): ILinkAccount | null {
    try {
      const file = this.accountPath()
      if (!fs.existsSync(file)) return null
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as ILinkAccount
    } catch {
      return null
    }
  }

  private saveAccount(account: ILinkAccount): void {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true })
    const file = this.accountPath()
    fs.writeFileSync(file, JSON.stringify(account, null, 2), 'utf-8')
    try {
      fs.chmodSync(file, 0o600)
    } catch {
      // best-effort
    }
  }

  // ── 同步缓冲区持久化 ─────────────────────────────────────────────────

  private loadSyncBuf(): string {
    try {
      if (fs.existsSync(this.syncBufPath)) {
        return fs.readFileSync(this.syncBufPath, 'utf-8')
      }
    } catch {
      // ignore
    }
    return ''
  }

  private saveSyncBuf(buf: string): void {
    try {
      fs.mkdirSync(path.dirname(this.syncBufPath), { recursive: true })
      fs.writeFileSync(this.syncBufPath, buf, 'utf-8')
    } catch {
      // best-effort
    }
  }

  // ── 工具方法 ─────────────────────────────────────────────────────────

  private randomUin(): string {
    const uint32 = crypto.randomBytes(4).readUInt32BE(0)
    return Buffer.from(String(uint32), 'utf-8').toString('base64')
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }
}
