/**
 * Feishu WebSocket Client
 *
 * 使用飞书 WebSocket 长连接，无需公网地址和内网穿透
 * 文档: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/ws
 */

import type {
  FeishuEvent,
  FeishuWsGatewayResponse,
  FeishuWsMessage,
  FeishuWsConfig,
} from './types.js'

const DEFAULT_WS_CONFIG: FeishuWsConfig = {
  enabled: true,
  reconnect: true,
  reconnectInterval: 5000,
  heartbeatInterval: 30000,
}

/**
 * 飞书 WebSocket 客户端
 */
export class FeishuWebSocketClient {
  private appId: string
  private appSecret: string
  private config: FeishuWsConfig
  private ws: WebSocket | null = null
  private tenantAccessToken: string | null = null
  private tokenExpireAt: number = 0
  private heartbeatTimer: Timer | null = null
  private reconnectTimer: Timer | null = null
  private isRunning = false

  // 事件回调
  private onEventCallback: ((event: FeishuEvent) => void) | null = null
  private onErrorCallback: ((error: Error) => void) | null = null
  private onConnectCallback: (() => void) | null = null
  private onDisconnectCallback: ((reason: string) => void) | null = null

  constructor(appId: string, appSecret: string, config?: Partial<FeishuWsConfig>) {
    this.appId = appId
    this.appSecret = appSecret
    this.config = { ...DEFAULT_WS_CONFIG, ...config }
  }

  /**
   * 设置事件回调
   */
  onEvent(callback: (event: FeishuEvent) => void): void {
    this.onEventCallback = callback
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback
  }

  onConnect(callback: () => void): void {
    this.onConnectCallback = callback
  }

  onDisconnect(callback: (reason: string) => void): void {
    this.onDisconnectCallback = callback
  }

  /**
   * 启动 WebSocket 连接
   */
  async start(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true

    console.log('[Feishu WS] Starting WebSocket client...')
    await this.connect()
  }

  /**
   * 停止 WebSocket 连接
   */
  stop(): void {
    this.isRunning = false
    this.clearTimers()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    console.log('[Feishu WS] Stopped')
  }

  /**
   * 连接 WebSocket
   */
  private async connect(): Promise<void> {
    try {
      // 1. 获取 tenant_access_token
      await this.ensureToken()

      // 2. 获取 WebSocket 网关地址
      const gateway = await this.getGateway()

      // 3. 建立 WebSocket 连接
      await this.createConnection(gateway)
    } catch (error: any) {
      console.error('[Feishu WS] Connection failed:', error)

      // 分析错误原因
      const errMsg = error?.message || ''
      if (errMsg.includes('404') || errMsg.includes('not found')) {
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
        // 404 错误是配置问题，不需要重连
        this.isRunning = false
        return
      } else if (errMsg.includes('app secret invalid')) {
        console.log('[Feishu WS] App Secret 无效，请检查配置')
        this.isRunning = false
        return
      }

      if (this.config.reconnect && this.isRunning) {
        this.scheduleReconnect()
      }
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
        app_id: this.appId,
        app_secret: this.appSecret,
      }),
    })

    const data = await res.json() as { code: number; msg: string; tenant_access_token?: string; expire?: number }

    if (data.code !== 0) {
      throw new Error(`Failed to get token: ${data.msg}`)
    }

    this.tenantAccessToken = data.tenant_access_token!
    this.tokenExpireAt = Date.now() + (data.expire! - 60) * 1000

    console.log('[Feishu WS] Token obtained')
    return this.tenantAccessToken
  }

  /**
   * 获取 WebSocket 网关地址
   */
  private async getGateway(): Promise<string> {
    const res = await fetch('https://open.feishu.cn/open-apis/ws/v1/connect', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.tenantAccessToken}`,
      },
    })

    // 检查响应状态
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Failed to get gateway: HTTP ${res.status} - ${text.slice(0, 200)}`)
    }

    // 解析 JSON
    const text = await res.text()
    let data: FeishuWsGatewayResponse
    try {
      data = JSON.parse(text) as FeishuWsGatewayResponse
    } catch {
      throw new Error(`Failed to parse gateway response: ${text.slice(0, 200)}`)
    }

    if (data.code !== 0 || !data.data?.gateway) {
      throw new Error(`Failed to get gateway: code=${data.code}, msg=${data.msg}`)
    }

    console.log(`[Feishu WS] Gateway: ${data.data.gateway}`)
    return data.data.gateway
  }

  /**
   * 创建 WebSocket 连接
   */
  private createConnection(gateway: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${gateway}?token=${this.tenantAccessToken}`
      console.log(`[Feishu WS] Connecting to ${gateway}...`)

      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('[Feishu WS] Connected ✅')
        this.onConnectCallback?.()
        this.startHeartbeat()
        resolve()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onerror = (error) => {
        console.error('[Feishu WS] Error:', error)
        this.onErrorCallback?.(new Error('WebSocket error'))
        reject(error)
      }

      this.ws.onclose = (event) => {
        console.log(`[Feishu WS] Disconnected: code=${event.code}, reason=${event.reason}`)
        this.onDisconnectCallback?.(event.reason)
        this.clearTimers()

        if (this.config.reconnect && this.isRunning) {
          this.scheduleReconnect()
        }
      }
    })
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as FeishuWsMessage

      switch (msg.type) {
        case 'pong':
          // 心跳响应，忽略
          break

        case 'event':
          console.log(`[Feishu WS] Event: ${msg.payload.header?.event_type || 'unknown'}`)
          this.onEventCallback?.(msg.payload)
          break

        case 'error':
          console.error('[Feishu WS] Server error:', msg.payload)
          this.onErrorCallback?.(new Error(msg.payload.msg))
          break

        default:
          console.log('[Feishu WS] Unknown message:', data.slice(0, 100))
      }
    } catch (error) {
      console.error('[Feishu WS] Failed to parse message:', error)
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, this.config.heartbeatInterval)
  }

  /**
   * 调度重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return

    console.log(`[Feishu WS] Reconnecting in ${this.config.reconnectInterval}ms...`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.config.reconnectInterval)
  }

  /**
   * 清理定时器
   */
  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
