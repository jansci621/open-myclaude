/**
 * Web Chat Server
 *
 * HTTP and WebSocket server for the web chat interface.
 */

import { randomUUID } from 'crypto'
import type {
  WebChatConfig,
  WebSocketMessage,
  WebChatMessage,
  PendingPermissionRequest,
  SessionStatus,
  ClientState,
} from './types.js'
import { WebChatSessionManager } from './sessionManager.js'
import {
  serveFrontendHtml,
  serveFrontendJs,
  serveFrontendCss,
} from './frontend.js'
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
} from './services/pluginMarketService.js'
import type { InstallableScope } from '../services/plugins/pluginOperations.js'

/**
 * Web Chat HTTP/WebSocket Server
 */
export class WebChatServer {
  private config: WebChatConfig
  private sessionManager: WebChatSessionManager
  private clients = new Map<WebSocket, ClientState>()
  private server: ReturnType<typeof Bun.serve> | null = null
  private static readonly HTTP_IDLE_TIMEOUT_SECONDS = 255

  constructor(config: WebChatConfig) {
    this.config = config

    // Create session manager with callbacks
    this.sessionManager = new WebChatSessionManager(config, {
      onMessage: (sessionId, message) => this.broadcastMessage(sessionId, message),
      onMessageUpdate: (sessionId, message) => this.broadcastMessageUpdate(sessionId, message),
      onStreamDelta: (sessionId, messageId, delta) =>
        this.broadcastStreamDelta(sessionId, messageId, delta),
      onThinking: (sessionId, messageId, content) =>
        this.broadcastThinking(sessionId, messageId, content),
      onToolUse: (sessionId, messageId, name, input) =>
        this.broadcastToolUse(sessionId, messageId, name, input),
      onToolResult: (sessionId, toolUseId, content, isError) =>
        this.broadcastToolResult(sessionId, toolUseId, content, isError),
      onPermissionRequest: (sessionId, request) =>
        this.broadcastPermissionRequest(sessionId, request),
      onStatusChange: (sessionId, status) =>
        this.broadcastStatus(sessionId, status),
      onError: (sessionId, error) =>
        this.broadcastError(sessionId, error),
    })
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    this.server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,
      idleTimeout: WebChatServer.HTTP_IDLE_TIMEOUT_SECONDS,

      fetch: (req, server) => this.handleRequest(req, server),

      websocket: {
        open: (ws) => this.handleWsOpen(ws),
        close: (ws) => this.handleWsClose(ws),
        message: (ws, msg) => this.handleWsMessage(ws, msg as string),
        // 发送 WebSocket ping 保持连接活跃
        publishToSelf: true,
      },
    })

    // 启动心跳定时器，每 30 秒发送一次 ping
    setInterval(() => {
      for (const [ws] of this.clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping()
        }
      }
    }, 30000)

    console.log(`Web Chat server started`)
    console.log(`  HTTP: http://${this.config.host}:${this.config.port}`)
    console.log(`  WebSocket: ws://${this.config.host}:${this.config.port}/ws`)
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Close all sessions
    this.sessionManager.closeAll()

    // Close all WebSocket connections
    for (const [ws] of this.clients) {
      ws.close()
    }
    this.clients.clear()

    // Stop the server
    if (this.server) {
      this.server.stop()
      this.server = null
    }

    console.log('Web Chat server stopped')
  }

  /**
   * Handle HTTP request
   */
  private async handleRequest(req: Request, server: typeof Bun.serve): Promise<Response> {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return this.corsResponse()
    }

    // Authentication check
    if (this.config.authToken) {
      const auth = req.headers.get('authorization')
      const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

      if (token !== this.config.authToken) {
        return this.jsonResponse({ success: false, error: { message: 'Unauthorized' } }, 401)
      }
    }

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const token = url.searchParams.get('token')
      if (this.config.authToken && token !== this.config.authToken) {
        return new Response('Unauthorized', { status: 401 })
      }

      const upgraded = server.upgrade(req, {
        data: {
          id: randomUUID(),
          sessionId: url.searchParams.get('session_id') ?? undefined,
        },
      })

      return upgraded
        ? new Response(null, { status: 101 })
        : new Response('WebSocket upgrade failed', { status: 500 })
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return this.handleApiRequest(req, url)
    }

    // Static files (frontend)
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return serveFrontendHtml()
    }

    if (url.pathname === '/app.js') {
      return serveFrontendJs()
    }

    if (url.pathname === '/styles.css') {
      return serveFrontendCss()
    }

    return this.jsonResponse({ success: false, error: { message: 'Not found' } }, 404)
  }

  /**
   * Handle API request
   */
  private async handleApiRequest(req: Request, url: URL): Promise<Response> {
    const method = req.method
    const pathname = url.pathname

    try {
      // GET /api/sessions - List sessions
      if (pathname === '/api/sessions' && method === 'GET') {
        const sessions = this.sessionManager.getSessions()
        return this.jsonResponse({ success: true, data: sessions })
      }

      // POST /api/sessions - Create session
      if (pathname === '/api/sessions' && method === 'POST') {
        const body = await req.json().catch(() => ({}))
        const workingDir = (body as { workingDir?: string }).workingDir
        const session = await this.sessionManager.createSession(workingDir)
        return this.jsonResponse({ success: true, data: session }, 201)
      }

      // Session-specific routes
      const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)(.*)$/)
      if (sessionMatch) {
        const sessionId = sessionMatch[1]
        const subpath = sessionMatch[2]

        // GET /api/sessions/:id - Get session
        if (subpath === '' && method === 'GET') {
          const session = this.sessionManager.getSession(sessionId)
          if (!session) {
            return this.jsonResponse(
              { success: false, error: { message: 'Session not found' } },
              404
            )
          }
          return this.jsonResponse({ success: true, data: session })
        }

        // DELETE /api/sessions/:id - Close session
        if (subpath === '' && method === 'DELETE') {
          this.sessionManager.closeSession(sessionId)
          return this.jsonResponse({ success: true })
        }

        // POST /api/sessions/:id/messages - Send message
        if (subpath === '/messages' && method === 'POST') {
          const body = await req.json().catch(() => ({}))
          const content = (body as { content?: string }).content
          if (!content) {
            return this.jsonResponse(
              { success: false, error: { message: 'Missing content' } },
              400
            )
          }
          const success = await this.sessionManager.sendMessage(sessionId, content)
          return this.jsonResponse({ success })
        }

        // POST /api/sessions/:id/interrupt - Send interrupt
        if (subpath === '/interrupt' && method === 'POST') {
          this.sessionManager.sendInterrupt(sessionId)
          return this.jsonResponse({ success: true })
        }

        // POST /api/sessions/:id/permissions/:requestId - Respond to permission
        const permMatch = subpath.match(/^\/permissions\/([^/]+)$/)
        if (permMatch && method === 'POST') {
          const requestId = permMatch[1]
          const body = await req.json().catch(() => ({}))
          const { approved, message } = body as {
            approved?: boolean
            message?: string
          }

          this.sessionManager.respondToPermission(
            sessionId,
            requestId,
            approved ?? false,
            message
          )
          return this.jsonResponse({ success: true })
        }
      }

      // Plugin API routes
      // GET /api/plugins - List all plugins from marketplaces
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
        return this.jsonResponse({ success: true, data: result.items, pagination: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
        } })
      }

      // GET /api/plugins/facets - Facet counts for filters
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
        return this.jsonResponse({ success: true, data: facets })
      }

      // GET /api/plugins/installed - List installed plugins
      if (pathname === '/api/plugins/installed' && method === 'GET') {
        const plugins = await getInstalledPlugins()
        return this.jsonResponse({ success: true, data: plugins })
      }

      // GET /api/plugins/:id - Get single plugin
      const pluginMatch = pathname.match(/^\/api\/plugins\/([^/]+)$/)
      if (pluginMatch && method === 'GET') {
        const pluginId = decodeURIComponent(pluginMatch[1]!)
        const plugin = await getMarketPlugin(pluginId)
        if (!plugin) {
          return this.jsonResponse(
            { success: false, error: { message: 'Plugin not found' } },
            404
          )
        }
        return this.jsonResponse({ success: true, data: plugin })
      }

      // POST /api/plugins/install - Install plugin
      if (pathname === '/api/plugins/install' && method === 'POST') {
        const body = await req.json().catch(() => ({}))
        const { pluginId, scope } = body as {
          pluginId?: string
          scope?: InstallableScope
        }
        if (!pluginId) {
          return this.jsonResponse(
            { success: false, error: { message: 'Missing pluginId' } },
            400
          )
        }
        this.broadcastPluginOperation('install', pluginId, 'started', `Installing ${pluginId}...`)
        const result = await installPlugin({
          pluginId,
          scope: scope ?? 'user',
        })
        if (result.success) {
          this.broadcastPluginOperation('install', pluginId, 'succeeded', result.message)
          // Broadcast plugins changed to all clients
          this.broadcast({ type: 'plugins_changed', payload: {} })
        } else {
          this.broadcastPluginOperation('install', pluginId, 'failed', result.message)
        }
        return this.jsonResponse(result)
      }

      // POST /api/plugins/uninstall - Uninstall plugin
      if (pathname === '/api/plugins/uninstall' && method === 'POST') {
        const body = await req.json().catch(() => ({}))
        const { pluginId, scope, keepData } = body as {
          pluginId?: string
          scope?: InstallableScope
          keepData?: boolean
        }
        if (!pluginId) {
          return this.jsonResponse(
            { success: false, error: { message: 'Missing pluginId' } },
            400
          )
        }
        this.broadcastPluginOperation('uninstall', pluginId, 'started', `Uninstalling ${pluginId}...`)
        const result = await uninstallPlugin({
          pluginId,
          scope: scope ?? 'user',
          keepData,
        })
        if (result.success) {
          this.broadcastPluginOperation('uninstall', pluginId, 'succeeded', result.message)
          // Broadcast plugins changed to all clients
          this.broadcast({ type: 'plugins_changed', payload: {} })
        } else {
          this.broadcastPluginOperation('uninstall', pluginId, 'failed', result.message)
        }
        return this.jsonResponse(result)
      }

      // POST /api/plugins/toggle - Enable/disable plugin
      if (pathname === '/api/plugins/toggle' && method === 'POST') {
        const body = await req.json().catch(() => ({}))
        const { pluginId, enabled, scope } = body as {
          pluginId?: string
          enabled?: boolean
          scope?: InstallableScope
        }
        if (!pluginId || enabled === undefined) {
          return this.jsonResponse(
            { success: false, error: { message: 'Missing pluginId or enabled' } },
            400
          )
        }
        this.broadcastPluginOperation(
          'toggle',
          pluginId,
          'started',
          `${enabled ? 'Enabling' : 'Disabling'} ${pluginId}...`,
        )
        const result = await togglePlugin({
          pluginId,
          enabled,
          scope,
        })
        if (result.success) {
          this.broadcastPluginOperation('toggle', pluginId, 'succeeded', result.message)
          // Broadcast plugins changed to all clients
          this.broadcast({ type: 'plugins_changed', payload: {} })
        } else {
          this.broadcastPluginOperation('toggle', pluginId, 'failed', result.message)
        }
        return this.jsonResponse(result)
      }

      // POST /api/plugins/update - Update plugin
      if (pathname === '/api/plugins/update' && method === 'POST') {
        const body = await req.json().catch(() => ({}))
        const { pluginId, scope } = body as {
          pluginId?: string
          scope?: 'user' | 'project' | 'local' | 'managed'
        }
        if (!pluginId) {
          return this.jsonResponse(
            { success: false, error: { message: 'Missing pluginId' } },
            400
          )
        }
        this.broadcastPluginOperation('update', pluginId, 'started', `Updating ${pluginId}...`)
        const result = await updatePlugin({
          pluginId,
          scope: scope ?? 'user',
        })
        if (result.success) {
          this.broadcastPluginOperation('update', pluginId, 'succeeded', result.message)
          // Broadcast plugins changed to all clients
          this.broadcast({ type: 'plugins_changed', payload: {} })
        } else {
          this.broadcastPluginOperation('update', pluginId, 'failed', result.message)
        }
        return this.jsonResponse(result)
      }

      return this.jsonResponse({ success: false, error: { message: 'Not found' } }, 404)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error'
      return this.jsonResponse({ success: false, error: { message } }, 500)
    }
  }

  /**
   * Handle WebSocket open
   */
  private handleWsOpen(ws: WebSocket & { data?: { id: string; sessionId?: string } }): void {
    const client: ClientState = {
      id: ws.data?.id ?? randomUUID(),
      ws,
      sessionId: ws.data?.sessionId,
      connectedAt: new Date(),
    }
    this.clients.set(ws, client)

    // Send initial session list
    const msg: WebSocketMessage = {
      type: 'sessions_list',
      payload: { sessions: this.sessionManager.getSessions() },
    }
    ws.send(JSON.stringify(msg))

    this.log(`Client ${client.id} connected`)
  }

  /**
   * Handle WebSocket close
   */
  private handleWsClose(ws: WebSocket): void {
    const client = this.clients.get(ws)
    if (client) {
      this.clients.delete(ws)
      this.log(`Client ${client.id} disconnected`)
    }
  }

  /**
   * Handle WebSocket message
   */
  private handleWsMessage(ws: WebSocket, msg: string): void {
    const client = this.clients.get(ws)
    if (!client) return

    let data: WebSocketMessage
    try {
      data = JSON.parse(msg)
    } catch {
      this.sendWsError(ws, 'Invalid JSON')
      return
    }

    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }))
        break

      case 'create_session':
        // Create a new session
        this.handleCreateSession(ws, data.payload as { workingDir?: string } | undefined)
        break

      case 'message':
        if (data.payload && 'sessionId' in data.payload && 'content' in data.payload) {
          const sessionId = data.payload.sessionId as string
          const session = this.sessionManager.getSession(sessionId)

          if (!session) {
            this.sendWsError(ws, 'Session ' + sessionId + ' not found. Please create a new session.')
            return
          }

          if (session.status !== 'connected') {
            this.sendWsError(ws, 'Session ' + sessionId + ' is ' + session.status + '. Please wait or create a new session.')
            return
          }

          const success = this.sessionManager.sendMessage(sessionId, data.payload.content as string)
          if (!success) {
            this.sendWsError(ws, 'Failed to send message. Session may have disconnected.')
          }
        }
        break

      case 'permission_resolved':
        if (data.payload && 'sessionId' in data.payload) {
          const { sessionId, requestId, approved, message } = data.payload as {
            sessionId: string
            requestId: string
            approved: boolean
            message?: string
          }
          this.sessionManager.respondToPermission(sessionId, requestId, approved, message)
        }
        break
    }
  }

  /**
   * Handle create session request
   */
  private async handleCreateSession(ws: WebSocket, payload: { workingDir?: string } | undefined): Promise<void> {
    try {
      const session = await this.sessionManager.createSession(payload?.workingDir)
      const msg: WebSocketMessage = {
        type: 'session_created',
        payload: { ...session, sessionId: session.id },
      }
      ws.send(JSON.stringify(msg))
    } catch (error) {
      this.log(`Failed to create session: ${error}`)
      this.sendWsError(ws, `Failed to create session: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Broadcast message to all clients
   */
  private broadcastMessage(sessionId: string, message: WebChatMessage): void {
    const msg: WebSocketMessage = {
      type: 'message',
      payload: { ...message, sessionId },
    }
    this.broadcast(msg)
  }

  /**
   * Broadcast message update
   */
  private broadcastMessageUpdate(sessionId: string, message: WebChatMessage): void {
    const msg: WebSocketMessage = {
      type: 'message_update',
      payload: { ...message, sessionId },
    }
    this.broadcast(msg)
  }

  /**
   * Broadcast stream delta
   */
  private broadcastStreamDelta(sessionId: string, messageId: string, delta: string): void {
    const msg: WebSocketMessage = {
      type: 'message_stream',
      payload: { sessionId, messageId, delta },
    }
    this.broadcast(msg)
  }

  /**
   * Broadcast thinking content
   */
  private broadcastThinking(sessionId: string, messageId: string, content: string): void {
    const msg: WebSocketMessage = {
      type: 'thinking',
      payload: { sessionId, messageId, content },
    }
    this.broadcast(msg)
  }

  /**
   * Broadcast tool use
   */
  private broadcastToolUse(
    sessionId: string,
    messageId: string,
    name: string,
    input: Record<string, unknown>
  ): void {
    const msg: WebSocketMessage = {
      type: 'tool_use',
      payload: { sessionId, messageId, name, input },
    }
    this.broadcast(msg)
  }

  /**
   * Broadcast tool result
   */
  private broadcastToolResult(
    sessionId: string,
    toolUseId: string,
    content: string,
    isError?: boolean
  ): void {
    const msg: WebSocketMessage = {
      type: 'tool_result',
      payload: { sessionId, toolUseId, content, isError },
    }
    this.broadcast(msg)
  }

  /**
   * Broadcast permission request
   */
  private broadcastPermissionRequest(
    sessionId: string,
    request: PendingPermissionRequest
  ): void {
    const msg: WebSocketMessage = {
      type: 'permission_request',
      payload: { ...request, sessionId },
    }
    this.broadcast(msg)
  }

  /**
   * Broadcast status change
   */
  private broadcastStatus(sessionId: string, status: SessionStatus): void {
    const msg: WebSocketMessage = {
      type: 'session_status',
      payload: { sessionId, status },
    }
    this.broadcast(msg)
  }

  /**
   * Broadcast error
   */
  private broadcastError(sessionId: string, error: Error): void {
    const msg: WebSocketMessage = {
      type: 'error',
      payload: { message: error.message, sessionId },
    }
    this.broadcast(msg)
  }

  private broadcastPluginOperation(
    action: 'install' | 'uninstall' | 'toggle' | 'update',
    pluginId: string,
    phase: 'started' | 'succeeded' | 'failed',
    message: string,
  ): void {
    const msg: WebSocketMessage = {
      type: 'plugin_operation',
      payload: { action, pluginId, phase, message },
    }
    this.broadcast(msg)
  }

  /**
   * Broadcast to all connected clients
   */
  private broadcast(msg: WebSocketMessage): void {
    const data = JSON.stringify(msg)
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    }
  }

  /**
   * Send error to WebSocket client
   */
  private sendWsError(ws: WebSocket, message: string): void {
    const msg: WebSocketMessage = {
      type: 'error',
      payload: { message },
    }
    ws.send(JSON.stringify(msg))
  }

  /**
   * Create JSON response with CORS headers
   */
  private jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...this.corsHeaders(),
      },
    })
  }

  /**
   * Create CORS preflight response
   */
  private corsResponse(): Response {
    return new Response(null, {
      status: 204,
      headers: this.corsHeaders(),
    })
  }

  /**
   * Get CORS headers
   */
  private corsHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': this.config.corsOrigins.includes('*')
        ? '*'
        : this.config.corsOrigins.join(', '),
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  }

  /**
   * Serve frontend HTML
   */
  private serveFrontend(): Response {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Web Chat</title>
  <link rel="stylesheet" href="/styles.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>">
</head>
<body>
  <div id="app">
    <header>
      <div class="header-left">
        <h1>🤖 Claude Code</h1>
        <span class="subtitle">Web Chat Interface</span>
      </div>
      <div class="header-right">
        <div id="status" class="status-badge connecting">
          <span class="status-dot"></span>
          <span class="status-text">Connecting...</span>
        </div>
      </div>
    </header>
    <main>
      <aside id="sidebar">
        <div class="sidebar-header">
          <h2>Sessions</h2>
          <button id="new-session-btn" class="btn-primary">
            <span class="icon">+</span>
            <span>New Session</span>
          </button>
        </div>
        <ul id="session-list"></ul>
      </aside>
      <div id="chat">
        <div id="messages"></div>
        <div id="typing-indicator" class="hidden">
          <div class="typing">
            <span></span><span></span><span></span>
          </div>
          <span>Claude is thinking...</span>
        </div>
        <div id="input-area">
          <textarea id="input" placeholder="输入消息... (Ctrl+Enter 发送, Enter 换行)" disabled rows="1"></textarea>
          <button id="send-btn" class="btn-send" disabled title="发送 (Ctrl+Enter)">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </main>
    <div id="permission-modal" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2>🔐 Permission Request</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p id="permission-tool"></p>
          <pre id="permission-input"></pre>
        </div>
        <div class="modal-footer">
          <button id="deny-btn" class="btn-danger">Deny</button>
          <button id="approve-btn" class="btn-success">Approve</button>
        </div>
      </div>
    </div>
  </div>
  <script src="/app.js"></script>
</body>
</html>`
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  /**
   * Serve frontend JavaScript
   */
  private serveJs(): Response {
    const js = `// Web Chat Client - Enhanced Version
class WebChatClient {
  constructor() {
    this.ws = null
    this.sessionId = null
    this.currentPermissionRequest = null
    this.messages = new Map()
    this.isStreaming = false
    this.init()
  }

  init() {
    this.connect()
    this.bindEvents()
    this.autoResizeInput()
  }

  connect() {
    const wsUrl = \`\${location.protocol === 'https:' ? 'wss:' : 'ws:'}//\${location.host}/ws\`
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.setStatus('connected', 'Connected')
      this.enableInput(true)
    }

    this.ws.onclose = () => {
      this.setStatus('disconnected', 'Disconnected')
      this.enableInput(false)
      // Reconnect after 3 seconds
      setTimeout(() => this.connect(), 3000)
    }

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      this.handleMessage(msg)
    }

    this.ws.onerror = (e) => {
      console.error('WebSocket error:', e)
      this.showError('Connection error')
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'sessions_list':
        this.renderSessions(msg.payload.sessions)
        break
      case 'message':
        this.renderMessage(msg.payload)
        this.hideTyping()
        break
      case 'message_update':
        this.updateMessage(msg.payload)
        break
      case 'message_stream':
        this.handleStreamDelta(msg.payload)
        break
      case 'thinking':
        this.handleThinking(msg.payload)
        break
      case 'tool_use':
        this.handleToolUse(msg.payload)
        break
      case 'tool_result':
        this.handleToolResult(msg.payload)
        break
      case 'permission_request':
        this.showPermissionDialog(msg.payload)
        break
      case 'session_status':
        this.updateSessionStatus(msg.payload)
        break
      case 'error':
        this.showError(msg.payload.message)
        this.hideTyping()
        break
      case 'pong':
        break
    }
  }

  renderSessions(sessions) {
    const list = document.getElementById('session-list')
    list.innerHTML = sessions.map(s => \`
      <li data-id="\${s.id}" class="\${s.id === this.sessionId ? 'active' : ''}">
        <div class="session-info">
          <span class="session-id">\${s.id.slice(0, 8)}</span>
          <span class="session-time">\${this.formatTime(s.createdAt)}</span>
        </div>
        <span class="session-status \${s.status}">\${s.status}</span>
      </li>
    \`).join('')

    // Auto-select first connected session, or create one if none exist
    if (sessions.length === 0) {
      // No sessions, create one automatically
      this.createSession()
    } else if (!this.sessionId || !sessions.find(s => s.id === this.sessionId)) {
      // No session selected or selected session doesn't exist
      // Find first connected session
      const connectedSession = sessions.find(s => s.status === 'connected')
      if (connectedSession) {
        this.selectSession(connectedSession.id)
      } else {
        // No connected session, create a new one
        this.createSession()
      }
    }
  }

  selectSession(sessionId) {
    this.sessionId = sessionId
    console.log('Selected session:', sessionId)

    document.querySelectorAll('#session-list li').forEach(li => {
      li.classList.toggle('active', li.dataset.id === sessionId)
    })

    // Update input placeholder
    const input = document.getElementById('input')
    input.placeholder = 'Type a message... (Shift+Enter for new line)'

    // Load messages for this session
    fetch(\`/api/sessions/\${sessionId}\`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data.messages) {
          const container = document.getElementById('messages')
          container.innerHTML = ''
          this.messages.clear()
          data.data.messages.forEach(m => this.renderMessage(m))
          this.hideTyping()
        }
      })
  }

  renderMessage(msg) {
    // Store message
    this.messages.set(msg.id, msg)

    const container = document.getElementById('messages')

    // Remove any existing message with same ID
    const existing = document.getElementById(\`msg-\${msg.id}\`)
    if (existing) existing.remove()

    const div = document.createElement('div')
    div.id = \`msg-\${msg.id}\`
    div.className = \`message \${msg.role} \${msg.status === 'streaming' ? 'streaming' : ''}\`

    const avatar = this.getAvatar(msg.role)
    const content = this.formatContent(msg.content)

    div.innerHTML = \`
      <div class="message-avatar">\${avatar}</div>
      <div class="message-body">
        <div class="message-header">
          <span class="message-role">\${this.getRoleName(msg.role)}</span>
          <span class="message-time">\${this.formatTime(msg.timestamp)}</span>
        </div>
        <div class="message-content">\${content}</div>
        \${msg.status === 'streaming' ? '<div class="streaming-cursor"></div>' : ''}
      </div>
    \`

    container.appendChild(div)
    this.scrollToBottom()
  }

  updateMessage(msg) {
    const existing = this.messages.get(msg.id)
    if (existing) {
      Object.assign(existing, msg)
      this.renderMessage(msg)
    }
  }

  handleStreamDelta(payload) {
    const { messageId, delta } = payload
    let msg = this.messages.get(messageId)

    if (!msg) {
      // Create new streaming message
      msg = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'streaming'
      }
      this.messages.set(messageId, msg)
      this.renderMessage(msg)
      // Don't call showTyping here - message already shows streaming state
    }

    // Append delta
    if (typeof msg.content === 'string') {
      msg.content += delta
    }

    // Update DOM directly for performance
    const contentEl = document.querySelector(\`#msg-\${messageId} .message-content\`)
    if (contentEl) {
      contentEl.innerHTML = this.formatContent(msg.content)
      this.scrollToBottom()
    }
  }

  handleThinking(payload) {
    const { messageId, content } = payload
    // Show thinking indicator
    const container = document.getElementById('messages')

    let thinkingEl = document.getElementById('thinking-block')
    if (!thinkingEl) {
      thinkingEl = document.createElement('div')
      thinkingEl.id = 'thinking-block'
      thinkingEl.className = 'message assistant thinking-block'
      thinkingEl.innerHTML = \`
        <div class="message-avatar">🤔</div>
        <div class="message-body">
          <div class="message-header">
            <span class="message-role">Thinking</span>
          </div>
          <div class="message-content thinking-content"></div>
        </div>
      \`
      container.appendChild(thinkingEl)
    }

    const contentEl = thinkingEl.querySelector('.thinking-content')
    contentEl.textContent = content
    this.scrollToBottom()
  }

  handleToolUse(payload) {
    const { messageId, name, input } = payload
    // Don't show typing here - just show tool usage

    // Create tool use display
    const container = document.getElementById('messages')
    const toolEl = document.createElement('div')
    toolEl.className = 'tool-block'
    toolEl.innerHTML = \`
      <div class="tool-header">
        <span class="tool-icon">🔧</span>
        <span class="tool-name">\${name}</span>
      </div>
      <pre class="tool-input">\${JSON.stringify(input, null, 2)}</pre>
    \`
    container.appendChild(toolEl)
    this.scrollToBottom()
  }

  handleToolResult(payload) {
    const { toolUseId, content, isError } = payload
    this.hideTyping()

    // Create tool result display
    const container = document.getElementById('messages')
    const resultEl = document.createElement('div')
    resultEl.className = \`tool-block tool-result \${isError ? 'error' : ''}\`
    resultEl.innerHTML = \`
      <div class="tool-header">
        <span class="tool-icon">\${isError ? '❌' : '✅'}</span>
        <span class="tool-name">Result</span>
      </div>
      <pre class="tool-output">\${this.escapeHtml(content)}</pre>
    \`
    container.appendChild(resultEl)
    this.scrollToBottom()
  }

  formatContent(content) {
    if (typeof content === 'string') {
      return this.escapeHtml(content)
    }
    if (Array.isArray(content)) {
      return content.map(c => {
        if (c.type === 'text') return this.escapeHtml(c.text)
        if (c.type === 'tool_use') {
          return \`<div class="inline-tool">🔧 \${c.name}</div>\`
        }
        if (c.type === 'tool_result') {
          return \`<div class="inline-result \${c.is_error ? 'error' : ''}">\${this.escapeHtml(c.content)}</div>\`
        }
        return JSON.stringify(c)
      }).join('')
    }
    return JSON.stringify(content)
  }

  getAvatar(role) {
    switch (role) {
      case 'user': return '👤'
      case 'assistant': return '🤖'
      case 'system': return '⚙️'
      default: return '💬'
    }
  }

  getRoleName(role) {
    switch (role) {
      case 'user': return 'You'
      case 'assistant': return 'Claude'
      case 'system': return 'System'
      default: return role
    }
  }

  escapeHtml(str) {
    if (typeof str !== 'string') return str
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  formatTime(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  showTyping(message = 'Claude is thinking...') {
    const indicator = document.getElementById('typing-indicator')
    indicator.querySelector('span:last-child').textContent = message
    indicator.classList.remove('hidden')
    this.scrollToBottom()
  }

  hideTyping() {
    const indicator = document.getElementById('typing-indicator')
    indicator.classList.add('hidden')
    // Remove thinking block if exists
    const thinkingEl = document.getElementById('thinking-block')
    if (thinkingEl) thinkingEl.remove()
  }

  showPermissionDialog(payload) {
    this.currentPermissionRequest = payload
    document.getElementById('permission-tool').textContent = \`Tool: \${payload.toolName}\`
    document.getElementById('permission-input').textContent = JSON.stringify(payload.toolInput, null, 2)
    document.getElementById('permission-modal').classList.remove('hidden')
  }

  hidePermissionDialog() {
    document.getElementById('permission-modal').classList.add('hidden')
    this.currentPermissionRequest = null
  }

  sendPermissionResponse(approved) {
    if (!this.currentPermissionRequest) return
    this.ws.send(JSON.stringify({
      type: 'permission_resolved',
      payload: {
        sessionId: this.currentPermissionRequest.sessionId,
        requestId: this.currentPermissionRequest.requestId,
        approved
      }
    }))
    this.hidePermissionDialog()
  }

  createSession() {
    console.log('Creating new session...')
    fetch('/api/sessions', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        console.log('Session created:', data)
        if (data.success) {
          this.selectSession(data.data.id)
        } else {
          this.showError('Failed to create session: ' + (data.error?.message || 'Unknown error'))
        }
      })
      .catch(err => {
        console.error('Failed to create session:', err)
        this.showError('Failed to create session')
      })
  }

  sendMessage(content) {
    if (!content || !content.trim()) {
      console.log('Empty message, ignoring')
      return
    }

    if (!this.sessionId) {
      console.log('No session selected, creating one...')
      this.showError('No session selected. Creating a new session...')
      this.createSession()
      return
    }

    console.log('Sending message to session:', this.sessionId)

    // Clear input
    const input = document.getElementById('input')
    input.value = ''
    input.style.height = 'auto'

    // Send via WebSocket
    const payload = {
      type: 'message',
      payload: { sessionId: this.sessionId, content: content.trim() }
    }
    console.log('Sending:', payload)
    this.ws.send(JSON.stringify(payload))

    // Show typing indicator (will be hidden when we receive a message)
    this.showTyping()
  }

  setStatus(status, text) {
    const statusEl = document.getElementById('status')
    statusEl.className = \`status-badge \${status}\`
    statusEl.querySelector('.status-text').textContent = text
  }

  enableInput(enabled) {
    document.getElementById('input').disabled = !enabled
    document.getElementById('send-btn').disabled = !enabled
  }

  updateSessionStatus(payload) {
    this.setStatus(payload.status, \`Session: \${payload.status}\`)
  }

  showError(message) {
    console.error('Error:', message)
    const container = document.getElementById('messages')
    const div = document.createElement('div')
    div.className = 'message system error'
    div.innerHTML = \`
      <div class="message-avatar">⚠️</div>
      <div class="message-body">
        <div class="message-content error-text">\${this.escapeHtml(message)}</div>
      </div>
    \`
    container.appendChild(div)
    this.scrollToBottom()
    this.hideTyping()
  }

  scrollToBottom() {
    const container = document.getElementById('messages')
    container.scrollTop = container.scrollHeight
  }

  autoResizeInput() {
    const input = document.getElementById('input')
    input.addEventListener('input', () => {
      input.style.height = 'auto'
      input.style.height = Math.min(input.scrollHeight, 150) + 'px'
    })
  }

  bindEvents() {
    // New session button
    document.getElementById('new-session-btn').addEventListener('click', () => this.createSession())

    // Send button
    document.getElementById('send-btn').addEventListener('click', () => {
      const input = document.getElementById('input')
      this.sendMessage(input.value)
    })

    // Input keyboard events
    document.getElementById('input').addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter to send
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        this.sendMessage(e.target.value)
      }
      // Enter alone = new line (default behavior, do nothing)
      // Shift + Enter = new line (default behavior)
    })

    // Permission buttons
    document.getElementById('approve-btn').addEventListener('click', () => this.sendPermissionResponse(true))
    document.getElementById('deny-btn').addEventListener('click', () => this.sendPermissionResponse(false))

    // Modal close
    document.querySelector('.modal-close').addEventListener('click', () => this.hidePermissionDialog())
    document.querySelector('.modal-backdrop').addEventListener('click', () => this.hidePermissionDialog())

    // Session list click
    document.getElementById('session-list').addEventListener('click', (e) => {
      const li = e.target.closest('li')
      if (li) this.selectSession(li.dataset.id)
    })

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter to send
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const input = document.getElementById('input')
        this.sendMessage(input.value)
      }
      // Escape to close modal
      if (e.key === 'Escape') {
        this.hidePermissionDialog()
      }
    })

    // Heartbeat to keep connection alive
    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
  }
}

// Initialize
new WebChatClient()`
    return new Response(js, {
      headers: { 'Content-Type': 'application/javascript' },
    })
  }

  /**
   * Serve frontend CSS
   */
  private serveCss(): Response {
    const css = `/* ========== 基础样式 ========== */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  /* 配色方案 - 深色主题 */
  --bg-primary: #0d0d0f;
  --bg-secondary: #141417;
  --bg-tertiary: #1a1a1f;
  --bg-hover: #222228;
  --bg-active: #2a2a32;

  /* 文字颜色 */
  --text-primary: #ffffff;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;

  /* 强调色 */
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --accent-light: rgba(99, 102, 241, 0.15);

  /* 功能色 */
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;

  /* 边框和阴影 */
  --border: rgba(255, 255, 255, 0.08);
  --border-light: rgba(255, 255, 255, 0.12);
  --shadow: rgba(0, 0, 0, 0.5);
  --glow: rgba(99, 102, 241, 0.25);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  height: 100vh;
  overflow: hidden;
  line-height: 1.5;
}

/* ========== 布局 ========== */
#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* ========== 头部 ========== */
header {
  padding: 0.875rem 1.5rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  backdrop-filter: blur(10px);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

h1 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.subtitle {
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-weight: 400;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 100px;
  font-size: 0.8125rem;
  font-weight: 500;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
}

.status-badge.connected .status-dot {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
}
.status-badge.disconnected .status-dot { background: var(--danger); }
.status-badge.connecting .status-dot {
  background: var(--warning);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

/* ========== 主体布局 ========== */
main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ========== 侧边栏 ========== */
#sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 1rem 1rem 0.75rem;
}

.sidebar-header h2 {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 0.75rem;
}

#session-list {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  padding: 0 0.5rem 0.5rem;
}

#session-list li {
  padding: 0.625rem 0.75rem;
  cursor: pointer;
  border-radius: 8px;
  margin-bottom: 2px;
  transition: all 0.15s ease;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid transparent;
}

#session-list li:hover {
  background: var(--bg-hover);
}

#session-list li.active {
  background: var(--accent-light);
  border-color: var(--accent);
}

.session-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-id {
  font-weight: 500;
  font-size: 0.875rem;
  font-family: 'SF Mono', Monaco, monospace;
  color: var(--text-primary);
}

.session-time {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.session-status {
  font-size: 0.625rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.session-status.connected {
  color: var(--success);
  background: rgba(16, 185, 129, 0.1);
}
.session-status.disconnected {
  color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}

/* ========== 按钮 ========== */
.btn-primary {
  width: 100%;
  padding: 0.625rem 1rem;
  background: var(--accent);
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: translateY(0);
}

.icon {
  font-size: 1rem;
  font-weight: bold;
}

/* ========== 聊天区域 ========== */
#chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  min-width: 0;
}

#messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ========== 消息样式 ========== */
.message {
  display: flex;
  gap: 0.75rem;
  max-width: 75%;
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.message.user {
  margin-left: auto;
  flex-direction: row-reverse;
}

.message-avatar {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.message.user .message-avatar {
  background: var(--accent);
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.message-role {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.message-time {
  font-size: 0.625rem;
  color: var(--text-muted);
}

.message-content {
  background: var(--bg-secondary);
  padding: 0.625rem 0.875rem;
  border-radius: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9375rem;
  border: 1px solid var(--border);
}

.message.user .message-content {
  background: var(--accent);
  border-color: transparent;
  border-radius: 12px 12px 4px 12px;
  color: white;
}

.message.assistant .message-content {
  border-radius: 12px 12px 12px 4px;
}

.message.system .message-content {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.message.error .message-content {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--accent);
  margin-left: 1px;
  animation: blink 0.8s infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* ========== 工具块 ========== */
.tool-block {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin: 0.25rem 0;
  overflow: hidden;
  font-size: 0.8125rem;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-tertiary);
  font-weight: 500;
}

.tool-icon { font-size: 0.875rem; }
.tool-name { font-family: 'SF Mono', Monaco, monospace; }

.tool-input, .tool-output {
  padding: 0.625rem 0.75rem;
  margin: 0;
  font-size: 0.75rem;
  overflow-x: auto;
  max-height: 150px;
  overflow-y: auto;
  font-family: 'SF Mono', Monaco, monospace;
  background: transparent;
}

.tool-result.error .tool-header {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.inline-tool, .inline-result {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  margin: 0.125rem 0;
  border-radius: 4px;
  font-size: 0.75rem;
  background: var(--bg-tertiary);
  font-family: 'SF Mono', Monaco, monospace;
}

.inline-result.error {
  background: rgba(239, 68, 68, 0.15);
}

/* ========== 思考块 ========== */
.thinking-block {
  opacity: 0.75;
}
.thinking-content {
  font-style: italic;
  color: var(--text-muted);
  font-size: 0.8125rem;
}

/* ========== 输入区域 ========== */
#input-area {
  padding: 0.875rem 1.25rem;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  display: flex;
  gap: 0.625rem;
  align-items: flex-end;
}

#input {
  flex: 1;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9375rem;
  font-family: inherit;
  resize: none;
  min-height: 42px;
  max-height: 120px;
  line-height: 1.5;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

#input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--glow);
}

#input::placeholder {
  color: var(--text-muted);
}

#input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-send {
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-send:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: scale(1.02);
}

.btn-send:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ========== 打字指示器 ========== */
#typing-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}

#typing-indicator.hidden { display: none; }

.typing {
  display: flex;
  gap: 3px;
  align-items: center;
}

.typing span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: bounce 1.2s infinite;
}

.typing span:nth-child(2) { animation-delay: 0.15s; }
.typing span:nth-child(3) { animation-delay: 0.3s; }

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* ========== 弹窗 ========== */
.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal.hidden { display: none; }

.modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
}

.modal-content {
  position: relative;
  background: var(--bg-secondary);
  border-radius: 12px;
  max-width: 440px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px var(--shadow);
  border: 1px solid var(--border);
  animation: modalIn 0.2s ease-out;
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95) translateY(-10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  font-size: 1rem;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.15s;
}

.modal-close:hover { color: var(--text-primary); }

.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
}

.modal-body p {
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.modal-body pre {
  background: var(--bg-primary);
  padding: 0.75rem;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.75rem;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
}

.modal-footer {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid var(--border);
}

.btn-success, .btn-danger {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-success {
  background: var(--success);
  color: white;
}
.btn-success:hover { filter: brightness(1.1); }

.btn-danger {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.btn-danger:hover {
  background: var(--bg-hover);
  border-color: var(--danger);
  color: var(--danger);
}

/* ========== 滚动条 ========== */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--bg-hover);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--bg-active);
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--bg-hover) transparent;
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  #sidebar { display: none; }
  .message { max-width: 90%; }
  header { padding: 0.75rem 1rem; }
  h1 { font-size: 1rem; }
  .subtitle { display: none; }
}`
    return new Response(css, {
      headers: { 'Content-Type': 'text/css' },
    })
  }

  /**
   * Log message (if verbose)
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[WebChatServer] ${message}`)
    }
  }
}
