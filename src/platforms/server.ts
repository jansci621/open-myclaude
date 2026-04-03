/**
 * Multi-Platform Server
 */

import { serve } from 'bun'
import { platformRegistry } from './registry.js'
import { messageRouter } from './router.js'
import { WebChatSessionManager } from '../webchat/sessionManager.js'
import { serveFrontendHtml, serveFrontendJs, serveFrontendCss } from '../webchat/frontend.js'
import {
  listMarketPlugins,
  listMarketPluginsPage,
  getMarketPluginFacets,
  getMarketPlugin,
  installPlugin,
  uninstallPlugin,
  togglePlugin,
  updatePlugin,
  getInstalledPlugins,
  type PluginFilters,
} from '../webchat/services/pluginMarketService.js'
import type { InstallableScope } from '../services/plugins/pluginOperations.js'
import type { MultiPlatformConfig, PlatformConfig, PlatformId } from './types.js'

/**
 * 多平台服务器
 */
export class MultiPlatformServer {
  private config: MultiPlatformConfig
  private sessionManager: WebChatSessionManager | null = null
  private server: ReturnType<typeof Bun.serve> | null = null
  private wsClients = new Map<WebSocket, { sessionId?: string }>()

  constructor(config: MultiPlatformConfig) {
    this.config = config
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    // 创建 Session Manager
    this.sessionManager = new WebChatSessionManager({
      port: this.config.port,
      host: this.config.host,
      corsOrigins: ['*'],
      maxSessions: 100,
      sessionTimeoutMs: 30 * 60 * 1000,
      permissionMode: (this.config as any).permissionMode || 'ask',
      verbose: (this.config as any).verbose || false,
      settingsPath: (this.config as any).settingsPath,
    }, {
      onMessage: (sessionId, message) => {
        // 广播给 WebChat 前端
        this.broadcastWs(sessionId, { type: 'message', payload: { ...message, sessionId } })
        // 同时处理平台回复
        this.handleSessionMessage(sessionId, message)
      },
      onMessageUpdate: (sessionId, message) => {
        this.broadcastWs(sessionId, { type: 'message_update', payload: { ...message, sessionId } })
      },
      onStreamDelta: (sessionId, messageId, delta) => {
        this.broadcastWs(sessionId, { type: 'message_stream', payload: { sessionId, messageId, delta } })
      },
      onThinking: (sessionId, messageId, content) => {
        this.broadcastWs(sessionId, { type: 'thinking', payload: { sessionId, messageId, content } })
      },
      onToolUse: (sessionId, messageId, name, input) => {
        this.broadcastWs(sessionId, { type: 'tool_use', payload: { sessionId, messageId, name, input } })
      },
      onToolResult: (sessionId, toolUseId, content, isError) => {
        this.broadcastWs(sessionId, { type: 'tool_result', payload: { sessionId, toolUseId, content, isError } })
      },
      onPermissionRequest: (sessionId, request) => {
        this.broadcastWs(sessionId, { type: 'permission_request', payload: { ...request, sessionId } })
        this.handlePermissionRequest(sessionId, request)
      },
      onStatusChange: (sessionId, status) => {
        this.broadcastWs(sessionId, { type: 'session_status', payload: { sessionId, status } })
      },
      onError: (sessionId, error) => {
        this.broadcastWs(sessionId, { type: 'error', payload: { sessionId, message: error.message } })
      },
    })

    // 绑定到路由器
    messageRouter.setSessionManager(this.sessionManager)

    // 动态加载并注册平台适配器
    await this.loadPlatforms()

    // 启动 HTTP 服务器 (支持 WebSocket)
    this.server = serve({
      port: this.config.port,
      hostname: this.config.host,
      fetch: (req, server) => this.handleRequest(req, server),
      websocket: {
        open: (ws) => {
          const client = { sessionId: undefined as string | undefined }
          this.wsClients.set(ws, client)

          // 发送会话列表（兼容 WebChatClient）
          const sessions = this.sessionManager?.getSessions() || []
          ws.send(JSON.stringify({ type: 'sessions_list', payload: { sessions } }))
        },
        close: (ws) => {
          this.wsClients.delete(ws)
        },
        message: (ws, msg) => {
          this.handleWsMessage(ws, msg as string)
        },
      },
    })

    // 启动心跳定时器，每 30 秒发送一次 ping
    setInterval(() => {
      for (const ws of this.wsClients.keys()) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping()
        }
      }
    }, 30000)

    const host = this.config.host === '0.0.0.0' ? 'localhost' : this.config.host
    const platforms = platformRegistry.getAll()
    const webchatEnabled = (this.config as any).webchatEnabled

    console.log(`\n🚀 Multi-Platform Server Started`)
    console.log(`   HTTP: http://${host}:${this.config.port}`)
    console.log(`   Health: http://${host}:${this.config.port}/health`)

    if (webchatEnabled) {
      console.log(`   WebChat: http://${host}:${this.config.port}/`)
    }

    console.log('')
    console.log(`📦 Platforms (${platforms.length}):`)

    for (const adapter of platforms) {
      console.log(`   - ${adapter.platformName}: http://${host}:${this.config.port}${adapter.config.path}`)
    }

    console.log('')
    console.log('💡 飞书配置提示:')
    console.log('   1. 访问 https://open.feishu.cn/ 配置事件订阅')
    console.log(`   2. 请求网址: http://your-server:${this.config.port}/webhook/feishu`)
    console.log('   3. 订阅事件: im.message.receive_v1')
    console.log('')
  }

  /**
   * 处理 WebSocket 消息
   * 兼容 WebChatClient 的消息格式
   */
  private handleWsMessage(ws: WebSocket, msg: string): void {
    try {
      const data = JSON.parse(msg)
      const client = this.wsClients.get(ws)
      if (!client) return

      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }))
          break

        // WebChatClient 格式: { type: 'message', payload: { sessionId, content } }
        case 'message':
          if (data.payload?.sessionId && data.payload?.content) {
            const { sessionId, content } = data.payload
            const session = this.sessionManager?.getSession(sessionId)
            if (session && session.status === 'connected') {
              this.sessionManager?.sendMessage(sessionId, content)
              client.sessionId = sessionId
            } else {
              ws.send(JSON.stringify({ type: 'error', payload: { message: `Session ${sessionId} not found or disconnected` } }))
            }
          }
          break

        // WebChatClient 权限响应
        case 'permission_resolved':
          if (data.payload?.sessionId) {
            const { sessionId, requestId, approved, message } = data.payload
            this.sessionManager?.respondToPermission(sessionId, requestId, approved, message)
          }
          break

        // 旧格式兼容: { type: 'create_session' }
        case 'create_session':
          const session = this.sessionManager?.createSession()
          if (session) {
            client.sessionId = session.id
            ws.send(JSON.stringify({ type: 'session_created', sessionId: session.id }))
          }
          break

        // 旧格式兼容: { type: 'send_message', sessionId, content }
        case 'send_message':
          if (data.sessionId && data.content) {
            this.sessionManager?.sendMessage(data.sessionId, data.content)
          }
          break
      }
    } catch (e) {
      console.error('[WS] Error handling message:', e)
    }
  }

  /**
   * 广播 WebSocket 消息
   */
  private broadcastWs(sessionId: string, msg: any): void {
    const json = JSON.stringify(msg)
    for (const [ws, client] of this.wsClients) {
      if (client.sessionId === sessionId) {
        ws.send(json)
      }
    }
  }

  private broadcastAllWs(msg: any): void {
    const json = JSON.stringify(msg)
    for (const [ws] of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json)
      }
    }
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    await platformRegistry.stopAll()
    this.sessionManager?.closeAll()

    // 关闭所有 WebSocket
    for (const [ws] of this.wsClients) {
      ws.close()
    }
    this.wsClients.clear()

    this.server?.stop()
    console.log('Multi-Platform Server stopped')
  }

  /**
   * 加载平台适配器
   */
  private async loadPlatforms(): Promise<void> {
    const platforms = this.config.platforms

    // 飞书
    if (platforms.feishu?.enabled) {
      const { FeishuAdapter } = await import('./feishu/adapter.js')
      await platformRegistry.register(new FeishuAdapter(platforms.feishu))
    }

    // 企业微信
    if (platforms.wechat?.enabled) {
      const { WeComAdapter } = await import('./wechat/adapter.js')
      await platformRegistry.register(new WeComAdapter(platforms.wechat))
    }

    // 个人微信
    if ((platforms as any)['wechat-personal']?.enabled) {
      const { WeChatPersonalAdapter } = await import('./wechat-personal/adapter.js')
      const wpConfig = (platforms as any)['wechat-personal']
      const wpAdapter = new WeChatPersonalAdapter(wpConfig)
      await platformRegistry.register(wpAdapter)

      // 自动回复：消息到达后通过 messageRouter → sessionManager → Claude → 回复
      wpAdapter.onMessage = async (msg) => {
        const unified = await wpAdapter.normalizeMessage(msg)
        await messageRouter.route(unified)
      }
      console.log('[WeChat-Personal] Auto-reply enabled')
    }
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: Request, server: typeof Bun.serve): Promise<Response> {
    const url = new URL(req.url)

    // 日志请求
    if ((this.config as any).verbose) {
      console.log(`[HTTP] ${req.method} ${url.pathname}`)
    }

    // WebSocket 升级
    if (url.pathname === '/ws') {
      const success = server.upgrade(req)
      if (success) return undefined as any
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    // WebChat 前端页面（复用 WebChatServer 的 UI）
    if ((this.config as any).webchatEnabled) {
      if (url.pathname === '/' || url.pathname === '' || url.pathname === '/index.html') {
        return serveFrontendHtml()
      }
      if (url.pathname === '/app.js') {
        return serveFrontendJs()
      }
      if (url.pathname === '/styles.css') {
        return serveFrontendCss()
      }
    }

    // 健康检查
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        platforms: platformRegistry.getAll().map(a => ({
          id: a.platformId,
          name: a.platformName,
          enabled: a.config.enabled,
        })),
        webchat: (this.config as any).webchatEnabled || false,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // API 路由（复用 WebChatServer 的 REST API）
    if ((this.config as any).webchatEnabled && url.pathname.startsWith('/api/') && this.sessionManager) {
      return this.handleApiRequest(req, url)
    }

    // 路由到对应平台适配器
    for (const adapter of platformRegistry.getEnabled()) {
      if (url.pathname.startsWith(adapter.config.path)) {
        return adapter.handleWebhook(req)
      }
    }

    // 默认 404
    return new Response('Not Found', { status: 404 })
  }

  /**
   * 处理会话消息（Claude 响应）
   */
  private async handleSessionMessage(sessionId: string, message: any): Promise<void> {
    if (message.role !== 'assistant') return

    // 获取消息内容
    const content = typeof message.content === 'string' ? message.content : ''
    if (!content.trim()) return

    console.log(`[Session ${sessionId}] Claude response: ${content.slice(0, 100)}...`)

    // 通过消息路由器查找对应的平台映射
    const mapping = messageRouter.getSessionMappingBySessionId(sessionId)
    if (!mapping) {
      console.log(`[Session ${sessionId}] No platform mapping found (webchat session)`)
      return
    }

    // 获取对应的平台适配器
    const adapter = platformRegistry.get(mapping.platformId)
    if (!adapter) {
      console.error(`[Session ${sessionId}] Platform adapter not found: ${mapping.platformId}`)
      return
    }

    // 发送响应到平台
    try {
      await adapter.sendResponse(mapping.platformChatId, { content })
      console.log(`[Session ${sessionId}] Response sent to ${mapping.platformId}`)
    } catch (error) {
      console.error(`[Session ${sessionId}] Failed to send response:`, error)
    }
  }

  /**
   * 处理权限请求
   */
  private async handlePermissionRequest(sessionId: string, request: any): Promise<void> {
    console.log(`[Session ${sessionId}] Permission request: ${request.toolName}`)

    // 自动批准（可配置）
    this.sessionManager?.respondToPermission(sessionId, request.requestId, true)
  }

  /**
   * 处理 WebChat API 请求（兼容 WebChatClient 前端）
   */
  private async handleApiRequest(req: Request, url: URL): Promise<Response> {
    const method = req.method
    const pathname = url.pathname

    try {
      // GET /api/sessions - 列出会话
      if (pathname === '/api/sessions' && method === 'GET') {
        const sessions = this.sessionManager!.getSessions()
        return this.apiResponse({ success: true, data: sessions })
      }

      // POST /api/sessions - 创建会话
      if (pathname === '/api/sessions' && method === 'POST') {
        const body = await req.json().catch(() => ({})) as { workingDir?: string }
        const session = await this.sessionManager!.createSession(body.workingDir)
        return this.apiResponse({ success: true, data: session }, 201)
      }

      // 会话特定路由
      const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)(.*)$/)
      if (sessionMatch) {
        const sessionId = sessionMatch[1]
        const subpath = sessionMatch[2]

        // GET /api/sessions/:id
        if (subpath === '' && method === 'GET') {
          const session = this.sessionManager!.getSession(sessionId)
          if (!session) {
            return this.apiResponse({ success: false, error: { message: 'Session not found' } }, 404)
          }
          return this.apiResponse({ success: true, data: session })
        }

        // DELETE /api/sessions/:id
        if (subpath === '' && method === 'DELETE') {
          this.sessionManager!.closeSession(sessionId)
          return this.apiResponse({ success: true })
        }

        // POST /api/sessions/:id/messages
        if (subpath === '/messages' && method === 'POST') {
          const body = await req.json().catch(() => ({})) as { content?: string }
          if (!body.content) {
            return this.apiResponse({ success: false, error: { message: 'Missing content' } }, 400)
          }
          const success = this.sessionManager!.sendMessage(sessionId, body.content)
          return this.apiResponse({ success })
        }

        // POST /api/sessions/:id/interrupt
        if (subpath === '/interrupt' && method === 'POST') {
          this.sessionManager!.sendInterrupt(sessionId)
          return this.apiResponse({ success: true })
        }

        // POST /api/sessions/:id/permissions/:requestId
        const permMatch = subpath.match(/^\/permissions\/([^/]+)$/)
        if (permMatch && method === 'POST') {
          const requestId = permMatch[1]
          const body = await req.json().catch(() => ({})) as { approved?: boolean; message?: string }
          this.sessionManager!.respondToPermission(sessionId, requestId, body.approved ?? false, body.message)
          return this.apiResponse({ success: true })
        }
      }

      // Plugin API routes
      if (pathname === '/api/plugins' && method === 'GET') {
        const filters: PluginFilters = {
          page: Number(url.searchParams.get('page') ?? '1'),
          pageSize: Number(url.searchParams.get('pageSize') ?? '36'),
          marketplace: url.searchParams.get('marketplace') ?? undefined,
          source: url.searchParams.get('source') ?? undefined,
          category: url.searchParams.get('category') ?? undefined,
          techStack: url.searchParams.get('techStack') ?? undefined,
          role: url.searchParams.get('role') ?? undefined,
          businessDomain: url.searchParams.get('businessDomain') ?? undefined,
          search: url.searchParams.get('search') ?? undefined,
          filter: url.searchParams.get('filter') as PluginFilters['filter'] ?? undefined,
        }
        const result = await listMarketPluginsPage(filters)
        return this.apiResponse({ success: true, data: result.items, pagination: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
        } })
      }

      if (pathname === '/api/plugins/facets' && method === 'GET') {
        const facets = await getMarketPluginFacets({
          marketplace: url.searchParams.get('marketplace') ?? undefined,
          source: url.searchParams.get('source') ?? undefined,
          category: url.searchParams.get('category') ?? undefined,
          role: url.searchParams.get('role') ?? undefined,
          techStack: url.searchParams.get('techStack') ?? undefined,
          businessDomain: url.searchParams.get('businessDomain') ?? undefined,
          search: url.searchParams.get('search') ?? undefined,
          filter: url.searchParams.get('filter') as PluginFilters['filter'] ?? undefined,
        })
        return this.apiResponse({ success: true, data: facets })
      }

      if (pathname === '/api/plugins/installed' && method === 'GET') {
        const plugins = await getInstalledPlugins()
        return this.apiResponse({ success: true, data: plugins })
      }

      const pluginMatch = pathname.match(/^\/api\/plugins\/([^/]+)$/)
      if (pluginMatch && method === 'GET') {
        const pluginId = decodeURIComponent(pluginMatch[1]!)
        const plugin = await getMarketPlugin(pluginId)
        if (!plugin) {
          return this.apiResponse({ success: false, error: { message: 'Plugin not found' } }, 404)
        }
        return this.apiResponse({ success: true, data: plugin })
      }

      if (pathname === '/api/plugins/install' && method === 'POST') {
        const body = await req.json().catch(() => ({})) as {
          pluginId?: string
          scope?: InstallableScope
        }
        if (!body.pluginId) {
          return this.apiResponse({ success: false, error: { message: 'Missing pluginId' } }, 400)
        }
        this.broadcastAllWs({
          type: 'plugin_operation',
          payload: {
            action: 'install',
            pluginId: body.pluginId,
            phase: 'started',
            message: `Installing ${body.pluginId}...`,
          },
        })
        const result = await installPlugin({
          pluginId: body.pluginId,
          scope: body.scope ?? 'user',
        })
        this.broadcastAllWs({
          type: 'plugin_operation',
          payload: {
            action: 'install',
            pluginId: body.pluginId,
            phase: result.success ? 'succeeded' : 'failed',
            message: result.message,
          },
        })
        if (result.success) {
          this.broadcastAllWs({ type: 'plugins_changed', payload: {} })
        }
        return this.apiResponse(result)
      }

      if (pathname === '/api/plugins/uninstall' && method === 'POST') {
        const body = await req.json().catch(() => ({})) as {
          pluginId?: string
          scope?: InstallableScope
          keepData?: boolean
        }
        if (!body.pluginId) {
          return this.apiResponse({ success: false, error: { message: 'Missing pluginId' } }, 400)
        }
        this.broadcastAllWs({
          type: 'plugin_operation',
          payload: {
            action: 'uninstall',
            pluginId: body.pluginId,
            phase: 'started',
            message: `Uninstalling ${body.pluginId}...`,
          },
        })
        const result = await uninstallPlugin({
          pluginId: body.pluginId,
          scope: body.scope ?? 'user',
          keepData: body.keepData,
        })
        this.broadcastAllWs({
          type: 'plugin_operation',
          payload: {
            action: 'uninstall',
            pluginId: body.pluginId,
            phase: result.success ? 'succeeded' : 'failed',
            message: result.message,
          },
        })
        if (result.success) {
          this.broadcastAllWs({ type: 'plugins_changed', payload: {} })
        }
        return this.apiResponse(result)
      }

      if (pathname === '/api/plugins/toggle' && method === 'POST') {
        const body = await req.json().catch(() => ({})) as {
          pluginId?: string
          enabled?: boolean
          scope?: InstallableScope
        }
        if (!body.pluginId || body.enabled === undefined) {
          return this.apiResponse({ success: false, error: { message: 'Missing pluginId or enabled' } }, 400)
        }
        this.broadcastAllWs({
          type: 'plugin_operation',
          payload: {
            action: 'toggle',
            pluginId: body.pluginId,
            phase: 'started',
            message: `${body.enabled ? 'Enabling' : 'Disabling'} ${body.pluginId}...`,
          },
        })
        const result = await togglePlugin({
          pluginId: body.pluginId,
          enabled: body.enabled,
          scope: body.scope,
        })
        this.broadcastAllWs({
          type: 'plugin_operation',
          payload: {
            action: 'toggle',
            pluginId: body.pluginId,
            phase: result.success ? 'succeeded' : 'failed',
            message: result.message,
          },
        })
        if (result.success) {
          this.broadcastAllWs({ type: 'plugins_changed', payload: {} })
        }
        return this.apiResponse(result)
      }

      if (pathname === '/api/plugins/update' && method === 'POST') {
        const body = await req.json().catch(() => ({})) as {
          pluginId?: string
          scope?: 'user' | 'project' | 'local' | 'managed'
        }
        if (!body.pluginId) {
          return this.apiResponse({ success: false, error: { message: 'Missing pluginId' } }, 400)
        }
        this.broadcastAllWs({
          type: 'plugin_operation',
          payload: {
            action: 'update',
            pluginId: body.pluginId,
            phase: 'started',
            message: `Updating ${body.pluginId}...`,
          },
        })
        const result = await updatePlugin({
          pluginId: body.pluginId,
          scope: body.scope ?? 'user',
        })
        this.broadcastAllWs({
          type: 'plugin_operation',
          payload: {
            action: 'update',
            pluginId: body.pluginId,
            phase: result.success ? 'succeeded' : 'failed',
            message: result.message,
          },
        })
        if (result.success) {
          this.broadcastAllWs({ type: 'plugins_changed', payload: {} })
        }
        return this.apiResponse(result)
      }

      return this.apiResponse({ success: false, error: { message: 'Not found' } }, 404)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error'
      return this.apiResponse({ success: false, error: { message } }, 500)
    }
  }

  private apiResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }
}

/**
 * 启动多平台服务
 */
export async function startMultiPlatformServer(config: MultiPlatformConfig): Promise<MultiPlatformServer> {
  const server = new MultiPlatformServer(config)
  await server.start()
  return server
}
