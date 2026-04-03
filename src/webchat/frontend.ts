/**
 * Shared WebChat Frontend Assets
 *
 * Extracted from WebChatServer so both WebChatServer and MultiPlatformServer can reuse the same UI.
 */

// ========== HTML ==========
export function serveFrontendHtml(): Response {
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
        <div class="view-switcher">
          <button id="view-chat-btn" class="view-btn active">Chat</button>
          <button id="view-plugins-btn" class="view-btn">Plugins</button>
        </div>
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
      <div id="chat" class="content-view active">
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
      <div id="plugins-view" class="content-view hidden">
        <div class="plugins-shell">
          <div class="plugins-toolbar">
            <div class="plugins-toolbar-left">
              <h2>Plugin Marketplace</h2>
              <span id="plugins-summary" class="plugins-summary">Loading plugins...</span>
            </div>
            <div class="plugins-toolbar-actions">
              <input id="plugin-search" type="search" placeholder="Search plugins">
              <button id="refresh-plugins-btn" class="btn-secondary">Refresh</button>
            </div>
          </div>
          <div id="plugins-status" class="plugins-status hidden"></div>
          <div class="plugins-layout">
            <aside class="plugins-filters">
              <section class="filter-section">
                <div class="filter-section-title">来源</div>
                <div id="plugin-source-filters" class="filter-tags"></div>
              </section>
              <section class="filter-section">
                <div class="filter-section-title">职能领域</div>
                <div id="plugin-category-filters" class="filter-tags"></div>
              </section>
              <section class="filter-section">
                <div class="filter-section-title">岗位角色</div>
                <div id="plugin-role-filters" class="filter-tags"></div>
              </section>
              <section class="filter-section">
                <div class="filter-section-title">技术栈</div>
                <div id="plugin-tech-filters" class="filter-tags"></div>
              </section>
              <section class="filter-section">
                <div class="filter-section-title">业务域</div>
                <div id="plugin-business-domain-filters" class="filter-tags"></div>
              </section>
            </aside>
            <section class="plugins-content">
              <div id="plugin-quick-filters" class="quick-filter-btns"></div>
              <div id="plugin-active-filters" class="plugin-active-filters hidden"></div>
              <div id="plugins-grid" class="plugins-grid"></div>
              <div id="plugins-pagination" class="plugins-pagination hidden"></div>
            </section>
          </div>
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
    <div id="plugin-detail-modal" class="modal hidden">
      <div class="modal-backdrop plugin-detail-backdrop"></div>
      <div class="modal-content plugin-detail-modal-content">
        <div class="modal-header">
          <h2 id="plugin-detail-title">Plugin Details</h2>
          <button id="plugin-detail-close" class="modal-close">&times;</button>
        </div>
        <div id="plugin-detail-body" class="modal-body plugin-detail-body"></div>
        <div class="modal-footer">
          <a id="plugin-detail-link" class="btn-secondary plugin-link hidden" target="_blank" rel="noreferrer">Open Source</a>
          <button id="plugin-detail-dismiss" class="btn-danger">Close</button>
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

// ========== JavaScript ==========
export function serveFrontendJs(): Response {
  const js = `// Web Chat Client - Enhanced Version
const CATEGORY_FILTER_OPTIONS = [
  ['all', '全部'],
  ['agent', 'Agent'],
  ['architecture', '架构'],
  ['backend', '后端'],
  ['frontend', '前端'],
  ['testing', '测试'],
  ['security', '安全'],
  ['data', '数据'],
  ['devops', 'DevOps'],
  ['docs', '文档'],
  ['finance', '金融分析'],
  ['accounting', '财务会计'],
  ['hr', '人力资源'],
  ['legal', '法务'],
  ['operations', '运营']
]

const ROLE_FILTER_OPTIONS = [
  ['all', '全部岗位'],
  ['frontend-engineer', '前端工程师'],
  ['backend-engineer', '后端工程师'],
  ['fullstack-engineer', '全栈工程师'],
  ['architect', '架构师'],
  ['ai-engineer', 'AI 工程师'],
  ['data-engineer', '数据工程师'],
  ['test-engineer', '测试工程师'],
  ['security-engineer', '安全工程师'],
  ['sre', 'SRE'],
  ['finance-analyst', '金融分析'],
  ['accountant', '财务会计'],
  ['hr-specialist', '人力资源'],
  ['legal', '法务'],
  ['operations', '运营'],
  ['orchestrator', '编排器'],
  ['workflow', '工作流'],
  ['specialist', '专家']
]

const TECH_FILTER_OPTIONS = [
  ['all', '全部技术'],
  ['python', 'Python'],
  ['javascript', 'JS/TS'],
  ['rust', 'Rust'],
  ['go', 'Go'],
  ['java', 'Java'],
  ['react', 'React'],
  ['vue', 'Vue']
]

const BUSINESS_DOMAIN_FILTER_OPTIONS = [
  ['all', '全部业务域'],
  ['api', 'API'],
  ['contracts', '合同法务'],
  ['recruiting', '招聘'],
  ['payroll', '薪酬'],
  ['fp-and-a', '财务分析'],
  ['compliance', '合规'],
  ['customer-support', '客服支持'],
  ['crm', 'CRM']
]

const SOURCE_FILTER_OPTIONS = [
  ['all', '全部来源'],
  ['official', '官方市场'],
  ['community', '社区 ClawHub'],
  ['custom', '自定义市场']
]

const QUICK_FILTER_OPTIONS = [
  ['all', '全部'],
  ['hot', '热门'],
  ['new', '新上架'],
  ['installed', '已安装']
]

const FILTER_LABELS = {
  source: Object.fromEntries(SOURCE_FILTER_OPTIONS),
  category: Object.fromEntries(CATEGORY_FILTER_OPTIONS),
  role: Object.fromEntries(ROLE_FILTER_OPTIONS),
  techStack: Object.fromEntries(TECH_FILTER_OPTIONS),
  businessDomain: Object.fromEntries(BUSINESS_DOMAIN_FILTER_OPTIONS),
  filter: Object.fromEntries(QUICK_FILTER_OPTIONS),
}

class WebChatClient {
  constructor() {
    this.ws = null
    this.sessionId = null
    this.currentPermissionRequest = null
    this.messages = new Map()
    this.isStreaming = false
    this.currentView = 'chat'
    this.plugins = []
    this.installedPlugins = new Map()
    this.pluginOperations = new Map()
    this.pluginFacets = { quickFilters: [], sources: [], marketplaces: [], categories: [], roles: [], techStack: [], businessDomains: [] }
    this.pluginFilters = { search: '', filter: 'all', source: 'all', category: 'all', role: 'all', techStack: 'all', businessDomain: 'all' }
    this.pluginPagination = { page: 1, pageSize: 50, total: 0, totalPages: 1 }
    this.pluginVirtualState = { rowHeight: 320, overscan: 2, lastRangeKey: '' }
    this.pluginsLoaded = false
    this.pluginsPrefetched = false
    this.pluginWarmupOfficialPayload = null
    this.pluginWarmupFullPayload = null
    this.pluginWarmupFullPromise = null
    this.pluginHydrationRefreshTimer = null
    this.pluginHydrationRefreshAttempts = 0
    this.pluginDetail = null
    this.init()
  }

  init() {
    this.restoreStateFromUrl()
    this.connect()
    this.bindEvents()
    this.autoResizeInput()
    document.getElementById('plugin-search').value = this.pluginFilters.search || ''
    this.switchView(this.currentView)
  }

  connect() {
    const wsUrl = \`\${location.protocol === 'https:' ? 'wss:' : 'ws:'}//\${location.host}/ws\`
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.setStatus('connected', 'Connected')
      this.enableInput(true)
      this.schedulePluginPrefetch()
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
      case 'plugins_changed':
        this.loadPlugins(true)
        break
      case 'plugin_operation':
        this.handlePluginOperation(msg.payload)
        break
      case 'pong':
        break
    }
  }

  handlePluginOperation(payload) {
    const { pluginId, phase, message } = payload

    if (phase === 'started') {
      this.pluginOperations.set(pluginId, payload)
    } else {
      this.pluginOperations.delete(pluginId)
    }

    this.setPluginsStatus(message, phase === 'failed')

    if (this.currentView === 'plugins') {
      this.renderPlugins()
    }
  }

  switchView(view) {
    this.currentView = view
    const isChat = view === 'chat'
    document.getElementById('app').classList.toggle('plugins-mode', !isChat)
    document.getElementById('chat').classList.toggle('hidden', !isChat)
    document.getElementById('chat').classList.toggle('active', isChat)
    document.getElementById('plugins-view').classList.toggle('hidden', isChat)
    document.getElementById('plugins-view').classList.toggle('active', !isChat)
    document.getElementById('view-chat-btn').classList.toggle('active', isChat)
    document.getElementById('view-plugins-btn').classList.toggle('active', !isChat)
    this.syncUrlState()

    if (isChat) {
      this.cancelPluginHydrationRefresh()
    }

    if (!isChat && !this.pluginsLoaded) {
      this.loadPlugins()
    }
  }

  async loadPlugins(force = false, options = {}) {
    if (this.loadingPlugins && !force) return
    const silent = !!options.silent
    this.loadingPlugins = true
    if (!silent) {
      this.setPluginsStatus('Loading plugins...', false)
    }

    try {
      if (this.shouldUseStagedPluginLoad(force)) {
        await this.loadPluginsStaged()
      } else {
        const pluginsPayload = await this.fetchPluginsPayload()
        this.applyPluginsPayload(pluginsPayload)
        if (!silent) {
          this.setPluginsStatus('', false)
        }
      }
      void this.loadInstalledPlugins()
    } catch (error) {
      console.error('Failed to load plugins:', error)
      if (!silent) {
        this.setPluginsStatus(error.message || 'Failed to load plugins', true)
      }
    } finally {
      this.loadingPlugins = false
    }
  }

  async loadPluginsStaged() {
    this.cancelPluginHydrationRefresh()
    this.setPluginsStatus('Loading official marketplace...', false)
    const officialPayload = this.pluginWarmupOfficialPayload || await this.fetchPluginsPayload({ source: 'official' })
    this.applyPluginsPayload(officialPayload, { preserveSourceFacet: true })
    this.setPluginsStatus('Loading community marketplace in background...', false)

    const fullPayload = this.pluginWarmupFullPayload || await (this.pluginWarmupFullPromise || this.fetchPluginsPayload())
    this.applyPluginsPayload(fullPayload)
    this.pluginWarmupOfficialPayload = null
    this.pluginWarmupFullPayload = null
    this.pluginWarmupFullPromise = null
    this.setPluginsStatus('', false)
    this.schedulePluginHydrationRefresh()
  }

  async fetchPluginsPayload(overrides = {}) {
    const params = new URLSearchParams({
      search: this.pluginFilters.search || '',
      filter: this.pluginFilters.filter || 'all',
      source: overrides.source || this.pluginFilters.source || 'all',
      category: this.pluginFilters.category || 'all',
      role: this.pluginFilters.role || 'all',
      techStack: this.pluginFilters.techStack || 'all',
      businessDomain: this.pluginFilters.businessDomain || 'all',
      page: String(this.pluginPagination.page || 1),
      pageSize: String(this.pluginPagination.pageSize || 50),
    })

    const query = params.toString()
    const [pluginsResp, facetsResp] = await Promise.all([
      fetch('/api/plugins?' + query),
      fetch('/api/plugins/facets?' + query),
    ])

    const [pluginsData, facetsData] = await Promise.all([
      pluginsResp.json(),
      facetsResp.json(),
    ])

    if (!pluginsData.success) {
      throw new Error(pluginsData.error?.message || 'Failed to load plugins')
    }
    if (!facetsData.success) {
      throw new Error(facetsData.error?.message || 'Failed to load plugin facets')
    }

    return { pluginsData, facetsData }
  }

  applyPluginsPayload(payload, options = {}) {
    this.plugins = payload.pluginsData.data || []
    const nextFacets = payload.facetsData.data || { quickFilters: [], sources: [], marketplaces: [], categories: [], roles: [], techStack: [], businessDomains: [] }
    if (options.preserveSourceFacet) {
      this.pluginFacets = {
        ...nextFacets,
        sources: this.pluginFacets.sources?.length ? this.pluginFacets.sources : nextFacets.sources,
      }
    } else {
      this.pluginFacets = nextFacets
    }
    this.pluginPagination = {
      page: payload.pluginsData.pagination?.page || 1,
      pageSize: payload.pluginsData.pagination?.pageSize || this.pluginPagination.pageSize || 50,
      total: payload.pluginsData.pagination?.total || this.plugins.length,
      totalPages: payload.pluginsData.pagination?.totalPages || 1,
    }
    this.pluginsLoaded = true
    this.renderPluginFilters()
    this.renderPlugins()
    this.syncUrlState()
  }

  cancelPluginHydrationRefresh() {
    if (this.pluginHydrationRefreshTimer) {
      clearTimeout(this.pluginHydrationRefreshTimer)
      this.pluginHydrationRefreshTimer = null
    }
    this.pluginHydrationRefreshAttempts = 0
  }

  shouldRefreshAfterHydration() {
    return this.currentView === 'plugins'
      && this.pluginPagination.page === 1
      && this.pluginFilters.search === ''
      && this.pluginFilters.filter === 'all'
      && this.pluginFilters.source === 'all'
      && this.pluginFilters.category === 'all'
      && this.pluginFilters.role === 'all'
      && this.pluginFilters.techStack === 'all'
      && this.pluginFilters.businessDomain === 'all'
  }

  schedulePluginHydrationRefresh() {
    if (!this.shouldRefreshAfterHydration()) {
      this.cancelPluginHydrationRefresh()
      return
    }

    this.cancelPluginHydrationRefresh()
    const delays = [2500, 6000]
    const runRefresh = () => {
      if (!this.shouldRefreshAfterHydration()) {
        this.cancelPluginHydrationRefresh()
        return
      }

      this.loadPlugins(true, { silent: true }).catch(error => {
        console.error('Failed to refresh hydrated plugins:', error)
      })

      if (this.pluginHydrationRefreshAttempts >= delays.length) {
        this.pluginHydrationRefreshTimer = null
        return
      }

      const nextDelay = delays[this.pluginHydrationRefreshAttempts]
      this.pluginHydrationRefreshAttempts += 1
      this.pluginHydrationRefreshTimer = setTimeout(runRefresh, nextDelay)
    }

    this.pluginHydrationRefreshAttempts = 1
    this.pluginHydrationRefreshTimer = setTimeout(runRefresh, delays[0])
  }

  shouldUseStagedPluginLoad(force) {
    return !force
      && !this.pluginsLoaded
      && this.pluginPagination.page === 1
      && this.pluginFilters.search === ''
      && this.pluginFilters.filter === 'all'
      && this.pluginFilters.source === 'all'
      && this.pluginFilters.category === 'all'
      && this.pluginFilters.role === 'all'
      && this.pluginFilters.techStack === 'all'
      && this.pluginFilters.businessDomain === 'all'
  }

  async loadInstalledPlugins() {
    try {
      const response = await fetch('/api/plugins/installed')
      const data = await response.json()
      if (!data.success) return
      this.installedPlugins = new Map((data.data || []).map(plugin => [plugin.id, plugin]))
      if (this.currentView === 'plugins') {
        this.renderPlugins()
      }
    } catch (error) {
      console.error('Failed to load installed plugins:', error)
    }
  }

  schedulePluginPrefetch() {
    if (this.pluginsPrefetched || this.currentView === 'plugins') {
      return
    }
    this.pluginsPrefetched = true

    const runPrefetch = () => {
      this.fetchPluginsPayload({ source: 'official' })
        .then(payload => {
          this.pluginWarmupOfficialPayload = payload
        })
        .catch(() => null)

      this.pluginWarmupFullPromise = this.fetchPluginsPayload()
        .then(payload => {
          this.pluginWarmupFullPayload = payload
          return payload
        })
        .catch(() => null)

      void this.loadInstalledPlugins()
    }

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => runPrefetch(), { timeout: 1500 })
    } else {
      setTimeout(runPrefetch, 1200)
    }
  }

  renderPlugins() {
    const grid = document.getElementById('plugins-grid')
    const summary = document.getElementById('plugins-summary')
    const plugins = this.plugins || []

    summary.textContent = this.buildPluginsSummary(plugins)

    if (plugins.length === 0) {
      grid.innerHTML = '<div class="plugins-empty">No plugins match the current filters.</div>'
      this.renderPagination()
      return
    }

    const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } = this.computeVirtualWindow(grid, plugins.length)
    const visiblePlugins = plugins.slice(startIndex, endIndex)
    const topSpacer = topSpacerHeight > 0 ? \`<div class="plugin-grid-spacer" style="height:\${topSpacerHeight}px"></div>\` : ''
    const bottomSpacer = bottomSpacerHeight > 0 ? \`<div class="plugin-grid-spacer" style="height:\${bottomSpacerHeight}px"></div>\` : ''

    grid.innerHTML = [
      topSpacer,
      ...visiblePlugins.map(plugin => {
      const installed = this.installedPlugins.get(plugin.id) || plugin
      const isInstalled = !!installed.installed
      const isEnabled = !!installed.enabled
      const installable = plugin.installable !== false
      const operation = this.pluginOperations.get(plugin.id)
      const busy = operation && operation.phase === 'started'
      const badge = plugin.hot ? '<span class="plugin-badge hot">Hot</span>' : (plugin.new ? '<span class="plugin-badge new">New</span>' : '')
      const tags = [...(plugin.categories || []), plugin.role, ...(plugin.techStack || []), ...(plugin.businessDomains || [])].filter(Boolean).slice(0, 6)
        .map(tag => \`<span class="plugin-tag">\${this.escapeHtml(tag)}</span>\`).join('')

      return \`
        <article class="plugin-card" data-plugin-id="\${this.escapeHtml(plugin.id)}">
          <div class="plugin-card-top">
            <div class="plugin-icon">\${this.escapeHtml(plugin.icon || '📦')}</div>
            <div class="plugin-meta">
              <div class="plugin-title-row">
                <h3>\${this.escapeHtml(plugin.name)}</h3>
                \${badge}
              </div>
              <div class="plugin-subtitle">\${this.escapeHtml(plugin.marketplace || 'unknown')} · v\${this.escapeHtml(plugin.version || 'unknown')}</div>
            </div>
          </div>
          <p class="plugin-description">\${this.escapeHtml(plugin.description || 'No description')}</p>
          <div class="plugin-tags">\${tags || '<span class="plugin-tag muted">general</span>'}</div>
          <div class="plugin-stats">
            <span>\${isInstalled ? 'Installed' : 'Available'}</span>
            <span>\${this.escapeHtml(plugin.author || 'Unknown')}</span>
            <span>\${plugin.downloads || 0} downloads</span>
          </div>
          \${busy ? \`<div class="plugin-progress">\${this.escapeHtml(operation.message)}</div>\` : ''}
          <div class="plugin-actions">
            <button class="btn-secondary plugin-detail-trigger" data-plugin-id="\${this.escapeHtml(plugin.id)}">Details</button>
            \${!installable
              ? \`<a class="btn-secondary plugin-link" href="\${this.escapeHtml(plugin.externalUrl || '#')}" target="_blank" rel="noreferrer">Open</a>\`
              : isInstalled
              ? \`<button class="btn-secondary plugin-action" data-action="toggle" data-plugin-id="\${this.escapeHtml(plugin.id)}" \${busy ? 'disabled' : ''}>\${busy ? 'Working...' : (isEnabled ? 'Disable' : 'Enable')}</button>
                 <button class="btn-secondary plugin-action" data-action="update" data-plugin-id="\${this.escapeHtml(plugin.id)}" \${busy ? 'disabled' : ''}>Update</button>
                 <button class="btn-danger plugin-action" data-action="uninstall" data-plugin-id="\${this.escapeHtml(plugin.id)}" \${busy ? 'disabled' : ''}>Uninstall</button>\`
              : \`<button class="btn-primary plugin-action" data-action="install" data-plugin-id="\${this.escapeHtml(plugin.id)}" \${busy ? 'disabled' : ''}>\${busy ? 'Installing...' : 'Install'}</button>\`
            }
          </div>
        </article>
      \`
    }),
      bottomSpacer,
    ].join('')

    this.renderPagination()
  }

  computeVirtualWindow(grid, totalItems) {
    const minCardWidth = 280
    const gridGap = 16
    const width = grid.clientWidth || grid.offsetWidth || 0
    const columns = Math.max(1, Math.floor((width + gridGap) / (minCardWidth + gridGap)))
    const rowHeight = this.pluginVirtualState.rowHeight
    const overscan = this.pluginVirtualState.overscan
    const totalRows = Math.max(1, Math.ceil(totalItems / columns))
    const viewportHeight = grid.clientHeight || 720
    const scrollTop = grid.scrollTop || 0
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
    const startIndex = startRow * columns
    const endIndex = Math.min(totalItems, endRow * columns)

    return {
      startIndex,
      endIndex,
      topSpacerHeight: startRow * rowHeight,
      bottomSpacerHeight: Math.max(0, (totalRows - endRow) * rowHeight),
    }
  }

  buildPluginsSummary(plugins) {
    const activeFilters = []
    if (this.pluginFilters.source && this.pluginFilters.source !== 'all') activeFilters.push(this.pluginFilters.source)
    if (this.pluginFilters.category && this.pluginFilters.category !== 'all') activeFilters.push(this.pluginFilters.category)
    if (this.pluginFilters.role && this.pluginFilters.role !== 'all') activeFilters.push(this.pluginFilters.role)
    if (this.pluginFilters.techStack && this.pluginFilters.techStack !== 'all') activeFilters.push(this.pluginFilters.techStack)
    if (this.pluginFilters.businessDomain && this.pluginFilters.businessDomain !== 'all') activeFilters.push(this.pluginFilters.businessDomain)
    if (this.pluginFilters.filter && this.pluginFilters.filter !== 'all') activeFilters.push(this.pluginFilters.filter)
    const suffix = activeFilters.length > 0 ? \` · \${activeFilters.join(' / ')}\` : ''
    const total = this.pluginPagination?.total ?? plugins.length
    const page = this.pluginPagination?.page ?? 1
    const totalPages = this.pluginPagination?.totalPages ?? 1
    const pageSummary = totalPages > 1 ? \` · page \${page}/\${totalPages}\` : ''
    return \`\${total} plugin\${total === 1 ? '' : 's'}\${suffix}\${pageSummary}\`
  }

  renderPagination() {
    const container = document.getElementById('plugins-pagination')
    if (!container) return

    const { page, pageSize, totalPages, total } = this.pluginPagination || { page: 1, pageSize: 50, totalPages: 1, total: 0 }
    const pageButtons = this.buildPageButtons(page, totalPages)
    const pageSizeOptions = [24, 50, 60, 100]
      .map(size => \`<option value="\${size}" \${size === pageSize ? 'selected' : ''}>\${size}</option>\`)
      .join('')

    container.innerHTML = \`
      <div class="plugins-pagination-left">
        <label class="plugins-page-size-label" for="plugins-page-size">每页</label>
        <select id="plugins-page-size" class="plugins-page-size">
          \${pageSizeOptions}
        </select>
      </div>
      <div class="plugins-pagination-main">
        <button class="btn-secondary plugin-page-btn" data-page-action="prev" \${page <= 1 ? 'disabled' : ''}>Previous</button>
        <div class="plugins-page-numbers">\${pageButtons}</div>
        <button class="btn-secondary plugin-page-btn" data-page-action="next" \${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
      <span class="plugins-page-summary">Page \${page} / \${totalPages} · \${total} total</span>
    \`
    container.classList.remove('hidden')
  }

  buildPageButtons(page, totalPages) {
    if (totalPages <= 1) return ''

    const pages = new Set([1, totalPages, page - 1, page, page + 1])
    for (let cursor = Math.max(1, page - 2); cursor <= Math.min(totalPages, page + 2); cursor += 1) {
      pages.add(cursor)
    }

    const orderedPages = [...pages].filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b)
    const parts = []

    for (let index = 0; index < orderedPages.length; index += 1) {
      const current = orderedPages[index]
      const previous = orderedPages[index - 1]
      if (previous && current - previous > 1) {
        parts.push('<span class="plugins-page-ellipsis">…</span>')
      }
      parts.push(\`<button class="plugin-page-number \${current === page ? 'active' : ''}" data-page-number="\${current}">\${current}</button>\`)
    }

    return parts.join('')
  }

  renderPluginFilters() {
    this.renderFilterGroup('plugin-source-filters', SOURCE_FILTER_OPTIONS, 'source', 'filter-tag-btn', this.pluginFacets.sources)
    this.renderFilterGroup('plugin-category-filters', CATEGORY_FILTER_OPTIONS, 'category', 'filter-tag-btn', this.pluginFacets.categories)
    this.renderFilterGroup('plugin-role-filters', ROLE_FILTER_OPTIONS, 'role', 'filter-tag-btn', this.pluginFacets.roles)
    this.renderFilterGroup('plugin-tech-filters', TECH_FILTER_OPTIONS, 'techStack', 'filter-tag-btn', this.pluginFacets.techStack)
    this.renderFilterGroup('plugin-business-domain-filters', BUSINESS_DOMAIN_FILTER_OPTIONS, 'businessDomain', 'filter-tag-btn', this.pluginFacets.businessDomains)
    this.renderFilterGroup('plugin-quick-filters', QUICK_FILTER_OPTIONS, 'filter', 'quick-filter-btn', this.pluginFacets.quickFilters)
    this.renderActiveFilters()
  }

  renderFilterGroup(containerId, options, key, buttonClass = 'filter-tag-btn', counts = []) {
    const container = document.getElementById(containerId)
    if (!container) return
    const hasCounts = Array.isArray(counts) && counts.length > 0
    const countsMap = new Map((counts || []).map(item => [item.id, item.count]))
    const totalCount = (counts || []).reduce((sum, item) => sum + (item.count || 0), 0)
    container.innerHTML = options.map(([value, label]) => {
      const active = (this.pluginFilters[key] || 'all') === value
      const count = value === 'all' ? totalCount : (countsMap.get(value) ?? 0)
      const badge = hasCounts ? \`<span class="filter-count">\${count}</span>\` : ''
      return \`<button class="\${buttonClass} \${active ? 'active' : ''}" data-filter-key="\${this.escapeHtml(key)}" data-filter-value="\${this.escapeHtml(value)}">\${this.escapeHtml(label)}\${badge}</button>\`
    }).join('')
  }

  renderActiveFilters() {
    const container = document.getElementById('plugin-active-filters')
    if (!container) return

    const activeEntries = Object.entries(this.pluginFilters)
      .filter(([key, value]) => key !== 'search' && value && value !== 'all')

    if (this.pluginFilters.search) {
      activeEntries.unshift(['search', this.pluginFilters.search])
    }

    if (activeEntries.length === 0) {
      container.innerHTML = ''
      container.classList.add('hidden')
      return
    }

    const chips = activeEntries.map(([key, value]) => {
      const label = key === 'search'
        ? \`搜索: \${value}\`
        : \`\${this.getFilterGroupLabel(key)}: \${this.getFilterLabel(key, value)}\`
      return \`<button class="active-filter-chip" data-active-filter-key="\${this.escapeHtml(key)}" data-active-filter-value="\${this.escapeHtml(value)}">\${this.escapeHtml(label)} <span class="active-filter-remove">×</span></button>\`
    }).join('')

    container.innerHTML = \`
      <div class="active-filter-summary">当前筛选</div>
      <div class="active-filter-list">\${chips}</div>
      <button id="clear-plugin-filters-btn" class="btn-secondary clear-filters-btn">Clear all</button>
    \`
    container.classList.remove('hidden')
  }

  getFilterLabel(key, value) {
    return FILTER_LABELS[key]?.[value] || value
  }

  restoreStateFromUrl() {
    this.currentView = 'chat'
    this.pluginFilters = { search: '', filter: 'all', source: 'all', category: 'all', role: 'all', techStack: 'all', businessDomain: 'all' }
    this.pluginPagination = { ...this.pluginPagination, page: 1, pageSize: 50 }
    const url = new URL(window.location.href)
    const view = url.searchParams.get('view')
    if (view === 'plugins' || view === 'chat') {
      this.currentView = view
    }

    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    if (Number.isFinite(page) && page > 0) this.pluginPagination.page = page
    if (Number.isFinite(pageSize) && pageSize > 0) this.pluginPagination.pageSize = pageSize

    for (const key of ['search', 'filter', 'source', 'category', 'role', 'techStack', 'businessDomain']) {
      const value = url.searchParams.get(key)
      if (value) this.pluginFilters[key] = value
    }
  }

  syncUrlState() {
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('view', this.currentView)

    if (this.currentView === 'plugins') {
      for (const [key, value] of Object.entries(this.pluginFilters)) {
        if (value && value !== 'all') {
          url.searchParams.set(key, value)
        }
      }
      if (this.pluginFilters.search) {
        url.searchParams.set('search', this.pluginFilters.search)
      }
      if (this.pluginPagination.page > 1) {
        url.searchParams.set('page', String(this.pluginPagination.page))
      }
      if (this.pluginPagination.pageSize !== 50) {
        url.searchParams.set('pageSize', String(this.pluginPagination.pageSize))
      }
    }

    window.history.replaceState(null, '', url)
  }

  getFilterGroupLabel(key) {
    if (key === 'source') return '来源'
    if (key === 'category') return '职能领域'
    if (key === 'role') return '岗位角色'
    if (key === 'techStack') return '技术栈'
    if (key === 'businessDomain') return '业务域'
    if (key === 'filter') return '快捷筛选'
    if (key === 'search') return '搜索'
    return key
  }

  clearPluginFilters() {
    this.cancelPluginHydrationRefresh()
    this.pluginFilters = { search: '', filter: 'all', source: 'all', category: 'all', role: 'all', techStack: 'all', businessDomain: 'all' }
    this.pluginPagination.page = 1
    const searchInput = document.getElementById('plugin-search')
    if (searchInput) searchInput.value = ''
    this.renderPluginFilters()
    this.loadPlugins(true)
  }

  async handlePluginAction(action, pluginId) {
    if (this.pluginOperations.has(pluginId)) {
      return
    }

    const installed = this.installedPlugins.get(pluginId)
    let endpoint = ''
    let body = { pluginId, scope: 'user' }

    if (action === 'install') {
      endpoint = '/api/plugins/install'
    } else if (action === 'uninstall') {
      endpoint = '/api/plugins/uninstall'
    } else if (action === 'toggle') {
      endpoint = '/api/plugins/toggle'
      body.enabled = !(installed && installed.enabled)
    } else if (action === 'update') {
      endpoint = '/api/plugins/update'
    } else {
      return
    }

    this.pluginOperations.set(pluginId, {
      action,
      pluginId,
      phase: 'started',
      message: \`\${action} \${pluginId}...\`,
    })
    this.renderPlugins()
    this.setPluginsStatus(\`\${action} \${pluginId}...\`, false)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await response.json()

      if (!data.success) {
        this.pluginOperations.delete(pluginId)
        this.renderPlugins()
        throw new Error(data.error?.message || \`Failed to \${action} plugin\`)
      }

      this.setPluginsStatus(data.message || \`Plugin \${action} succeeded\`, false)
      await this.loadPlugins(true)
    } catch (error) {
      this.pluginOperations.delete(pluginId)
      this.renderPlugins()
      console.error(\`Plugin action failed (\${action}):\`, error)
      this.setPluginsStatus(error.message || \`Failed to \${action} plugin\`, true)
    }
  }

  async openPluginDetail(pluginId) {
    const modal = document.getElementById('plugin-detail-modal')
    const titleEl = document.getElementById('plugin-detail-title')
    const bodyEl = document.getElementById('plugin-detail-body')
    const linkEl = document.getElementById('plugin-detail-link')

    titleEl.textContent = 'Loading plugin details...'
    bodyEl.innerHTML = '<div class="plugin-detail-loading">Fetching plugin metadata...</div>'
    linkEl.classList.add('hidden')
    linkEl.removeAttribute('href')
    modal.classList.remove('hidden')

    try {
      const response = await fetch(\`/api/plugins/\${encodeURIComponent(pluginId)}\`)
      const data = await response.json()

      if (!data.success || !data.data) {
        throw new Error(data.error?.message || 'Failed to load plugin details')
      }

      this.pluginDetail = data.data
      titleEl.textContent = data.data.name || pluginId
      bodyEl.innerHTML = this.renderPluginDetail(data.data)

      if (data.data.externalUrl) {
        linkEl.href = data.data.externalUrl
        linkEl.textContent = data.data.installable === false ? 'Open Listing' : 'Open Source'
        linkEl.classList.remove('hidden')
      }
    } catch (error) {
      console.error('Failed to load plugin detail:', error)
      titleEl.textContent = pluginId
      bodyEl.innerHTML = \`<div class="plugin-detail-error">\${this.escapeHtml(error.message || 'Failed to load plugin details')}</div>\`
      linkEl.classList.add('hidden')
    }
  }

  hidePluginDetail() {
    document.getElementById('plugin-detail-modal').classList.add('hidden')
    this.pluginDetail = null
  }

  renderPluginDetail(plugin) {
    const stats = [
      ['Marketplace', plugin.marketplace || 'unknown'],
      ['Version', plugin.version || 'unknown'],
      ['Author', plugin.author || 'Unknown'],
      ['Downloads', String(plugin.downloads || 0)],
      ['Install', plugin.installable === false ? 'External listing' : (plugin.installed ? (plugin.enabled ? 'Installed · Enabled' : 'Installed · Disabled') : 'Available')],
      ['Source', plugin.sourceType || 'native'],
    ]

    const sections = []
    const pushSection = (title, values) => {
      const items = (values || []).filter(Boolean)
      if (items.length === 0) return
      sections.push(\`
        <section class="plugin-detail-section">
          <h3>\${this.escapeHtml(title)}</h3>
          <div class="plugin-detail-tags">
            \${items.map(value => \`<span class="plugin-tag">\${this.escapeHtml(String(value))}</span>\`).join('')}
          </div>
        </section>
      \`)
    }

    pushSection('Categories', plugin.categories)
    pushSection('Roles', [plugin.role, ...(plugin.roles || [])])
    pushSection('Tech Stack', plugin.techStack)
    pushSection('Business Domains', plugin.businessDomains)
    pushSection('Tags', plugin.tags)

    const description = plugin.description || 'No description available.'

    return \`
      <div class="plugin-detail-summary">
        <div class="plugin-detail-icon">\${this.escapeHtml(plugin.icon || '📦')}</div>
        <div class="plugin-detail-intro">
          <p class="plugin-detail-description">\${this.escapeHtml(description)}</p>
        </div>
      </div>
      <section class="plugin-detail-section">
        <h3>Overview</h3>
        <div class="plugin-detail-grid">
          \${stats.map(([label, value]) => \`
            <div class="plugin-detail-stat">
              <span class="plugin-detail-stat-label">\${this.escapeHtml(label)}</span>
              <span class="plugin-detail-stat-value">\${this.escapeHtml(value)}</span>
            </div>
          \`).join('')}
        </div>
      </section>
      \${sections.join('')}
    \`
  }

  setPluginsStatus(message, isError) {
    const el = document.getElementById('plugins-status')
    if (!message) {
      el.textContent = ''
      el.classList.add('hidden')
      el.classList.remove('error')
      return
    }

    el.textContent = message
    el.classList.remove('hidden')
    el.classList.toggle('error', !!isError)
  }

  renderSessions(sessions) {
    const list = document.getElementById('session-list')
    list.innerHTML = sessions.map(s => {
      // 获取最后一条用户消息作为摘要
      const lastUserMsg = s.messages?.filter(m => m.role === 'user').pop()
      const preview = lastUserMsg
        ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : lastUserMsg.content?.[0]?.text || '').slice(0, 60)
        : 'No messages yet'
      return \`
      <li data-id="\${s.id}" class="\${s.id === this.sessionId ? 'active' : ''}">
        <div class="session-info">
          <span class="session-id">\${s.id.slice(0, 8)}</span>
          <span class="session-preview">\${this.escapeHtml(preview)}</span>
          <span class="session-time">\${this.formatTime(s.lastActivityAt || s.createdAt)}</span>
        </div>
        <span class="session-status \${s.status}">\${s.status}</span>
      </li>
    \`
    }).join('')

    // Auto-select first connected session, or create one if none exist
    if (sessions.length === 0) {
      this.createSession()
    } else if (!this.sessionId || !sessions.find(s => s.id === this.sessionId)) {
      const connectedSession = sessions.find(s => s.status === 'connected')
      if (connectedSession) {
        this.selectSession(connectedSession.id)
      } else {
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

    const input = document.getElementById('input')
    input.placeholder = 'Type a message... (Shift+Enter for new line)'

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
    this.messages.set(msg.id, msg)

    const container = document.getElementById('messages')

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

    // 更新侧边栏摘要
    if (msg.role === 'user') {
      this.updateSessionPreview(msg.sessionId, msg.content)
    }
  }

  updateSessionPreview(sessionId, content) {
    const text = typeof content === 'string' ? content : (content?.[0]?.text || '')
    const preview = text.slice(0, 60)
    const li = document.querySelector(\`#session-list li[data-id="\${sessionId}"]\`)
    if (li) {
      const previewEl = li.querySelector('.session-preview')
      if (previewEl) previewEl.textContent = preview
    }
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
      msg = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'streaming'
      }
      this.messages.set(messageId, msg)
      this.renderMessage(msg)
    }

    if (typeof msg.content === 'string') {
      msg.content += delta
    }

    const contentEl = document.querySelector(\`#msg-\${messageId} .message-content\`)
    if (contentEl) {
      contentEl.innerHTML = this.formatContent(msg.content)
      this.scrollToBottom()
    }
  }

  handleThinking(payload) {
    const { messageId, content } = payload
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
    if (!content || !content.trim()) return

    if (!this.sessionId) {
      this.showError('No session selected. Creating a new session...')
      this.createSession()
      return
    }

    const input = document.getElementById('input')
    input.value = ''
    input.style.height = 'auto'

    const payload = {
      type: 'message',
      payload: { sessionId: this.sessionId, content: content.trim() }
    }
    this.ws.send(JSON.stringify(payload))
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
    document.getElementById('new-session-btn').addEventListener('click', () => this.createSession())
    document.getElementById('view-chat-btn').addEventListener('click', () => this.switchView('chat'))
    document.getElementById('view-plugins-btn').addEventListener('click', () => this.switchView('plugins'))
    document.getElementById('refresh-plugins-btn').addEventListener('click', () => this.loadPlugins(true))
    document.getElementById('plugin-search').addEventListener('input', (e) => {
      this.pluginFilters.search = e.target.value.trim()
      this.pluginPagination.page = 1
      clearTimeout(this.pluginSearchTimer)
      this.pluginSearchTimer = setTimeout(() => this.loadPlugins(true), 200)
    })
    document.getElementById('plugins-view').addEventListener('click', (e) => {
      const filterButton = e.target.closest('[data-filter-key]')
      if (filterButton) {
        this.pluginFilters[filterButton.dataset.filterKey] = filterButton.dataset.filterValue
        this.pluginPagination.page = 1
        this.renderPluginFilters()
        this.loadPlugins(true)
        return
      }

      const activeFilterButton = e.target.closest('[data-active-filter-key]')
      if (activeFilterButton) {
        const key = activeFilterButton.dataset.activeFilterKey
        if (key === 'search') {
          this.pluginFilters.search = ''
          const searchInput = document.getElementById('plugin-search')
          if (searchInput) searchInput.value = ''
        } else if (key) {
          this.pluginFilters[key] = 'all'
        }
        this.pluginPagination.page = 1
        this.renderPluginFilters()
        this.loadPlugins(true)
        return
      }

      if (e.target.closest('#clear-plugin-filters-btn')) {
        this.clearPluginFilters()
        return
      }

      const pageButton = e.target.closest('[data-page-action]')
      if (pageButton) {
        const action = pageButton.dataset.pageAction
        if (action === 'prev' && this.pluginPagination.page > 1) {
          this.pluginPagination.page -= 1
        } else if (action === 'next' && this.pluginPagination.page < this.pluginPagination.totalPages) {
          this.pluginPagination.page += 1
        } else {
          return
        }
        this.loadPlugins(true)
        return
      }

      const pageNumberButton = e.target.closest('[data-page-number]')
      if (pageNumberButton) {
        const targetPage = Number(pageNumberButton.dataset.pageNumber || '1')
        if (targetPage !== this.pluginPagination.page) {
          this.pluginPagination.page = targetPage
          this.loadPlugins(true)
        }
        return
      }
    })

    document.getElementById('plugins-view').addEventListener('change', (e) => {
      const pageSizeSelect = e.target.closest('#plugins-page-size')
      if (!pageSizeSelect) return
      const nextPageSize = Number(pageSizeSelect.value || '50')
      if (!Number.isFinite(nextPageSize) || nextPageSize === this.pluginPagination.pageSize) return
      this.pluginPagination.pageSize = nextPageSize
      this.pluginPagination.page = 1
      this.loadPlugins(true)
    })

    document.getElementById('send-btn').addEventListener('click', () => {
      const input = document.getElementById('input')
      this.sendMessage(input.value)
    })

    document.getElementById('input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        this.sendMessage(e.target.value)
      }
    })

    document.getElementById('approve-btn').addEventListener('click', () => this.sendPermissionResponse(true))
    document.getElementById('deny-btn').addEventListener('click', () => this.sendPermissionResponse(false))

    document.querySelector('.modal-close').addEventListener('click', () => this.hidePermissionDialog())
    document.querySelector('.modal-backdrop').addEventListener('click', () => this.hidePermissionDialog())
    document.getElementById('plugin-detail-close').addEventListener('click', () => this.hidePluginDetail())
    document.getElementById('plugin-detail-dismiss').addEventListener('click', () => this.hidePluginDetail())
    document.querySelector('.plugin-detail-backdrop').addEventListener('click', () => this.hidePluginDetail())

    document.getElementById('session-list').addEventListener('click', (e) => {
      const li = e.target.closest('li')
      if (li) this.selectSession(li.dataset.id)
    })

    document.getElementById('plugins-grid').addEventListener('click', (e) => {
      const detailButton = e.target.closest('.plugin-detail-trigger')
      if (detailButton) {
        this.openPluginDetail(detailButton.dataset.pluginId)
        return
      }
      const button = e.target.closest('.plugin-action')
      if (!button) return
      this.handlePluginAction(button.dataset.action, button.dataset.pluginId)
    })

    document.getElementById('plugins-grid').addEventListener('scroll', () => {
      if (this.currentView === 'plugins') {
        window.requestAnimationFrame(() => this.renderPlugins())
      }
    }, { passive: true })

    window.addEventListener('resize', () => {
      if (this.currentView === 'plugins') {
        window.requestAnimationFrame(() => this.renderPlugins())
      }
    })

    window.addEventListener('popstate', () => {
      this.restoreStateFromUrl()
      document.getElementById('plugin-search').value = this.pluginFilters.search || ''
      this.pluginsLoaded = false
      this.switchView(this.currentView)
      if (this.currentView === 'plugins') {
        this.loadPlugins(true)
      }
    })

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const input = document.getElementById('input')
        this.sendMessage(input.value)
      }
      if (e.key === 'Escape') {
        this.hidePermissionDialog()
        this.hidePluginDetail()
      }
    })

    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
  }
}

new WebChatClient()`
  return new Response(js, {
    headers: { 'Content-Type': 'application/javascript' },
  })
}

// ========== CSS ==========
export function serveFrontendCss(): Response {
  const css = `/* ========== 基础样式 ========== */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg-primary: #0d0d0f;
  --bg-secondary: #141417;
  --bg-tertiary: #1a1a1f;
  --bg-hover: #222228;
  --bg-active: #2a2a32;
  --text-primary: #ffffff;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --accent-light: rgba(99, 102, 241, 0.15);
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
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

.hidden {
  display: none !important;
}

#app { display: flex; flex-direction: column; height: 100vh; }

#app.plugins-mode #sidebar {
  display: none;
}

#app.plugins-mode #plugins-view {
  flex: 1 1 100%;
}

header {
  padding: 0.875rem 1.5rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  backdrop-filter: blur(10px);
}

.header-left { display: flex; align-items: center; gap: 1rem; }
.header-right { display: flex; align-items: center; gap: 0.75rem; }

.view-switcher {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: 999px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
}

.view-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 0.375rem 0.75rem;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
}

.view-btn.active {
  background: var(--accent);
  color: white;
}

h1 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.subtitle { color: var(--text-muted); font-size: 0.8125rem; font-weight: 400; }

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
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--text-muted);
}

.status-badge.connected .status-dot { background: var(--success); box-shadow: 0 0 8px var(--success); }
.status-badge.disconnected .status-dot { background: var(--danger); }
.status-badge.connecting .status-dot { background: var(--warning); animation: pulse 1.5s infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

main { flex: 1; display: flex; overflow: hidden; }
.content-view.hidden { display: none !important; }
.content-view.active { display: flex; }

#sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.sidebar-header { padding: 1rem 1rem 0.75rem; }
.sidebar-header h2 {
  font-size: 0.6875rem; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.75rem;
}

#session-list { flex: 1; overflow-y: auto; list-style: none; padding: 0 0.5rem 0.5rem; }
#session-list li {
  padding: 0.625rem 0.75rem; cursor: pointer; border-radius: 8px;
  margin-bottom: 2px; transition: all 0.15s ease;
  display: flex; justify-content: space-between; align-items: center;
  border: 1px solid transparent;
}
#session-list li:hover { background: var(--bg-hover); }
#session-list li.active { background: var(--accent-light); border-color: var(--accent); }

.session-info { display: flex; flex-direction: column; gap: 2px; }
.session-id { font-weight: 500; font-size: 0.875rem; font-family: 'SF Mono', Monaco, monospace; color: var(--text-primary); }
.session-preview { font-size: 0.6875rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; line-height: 1.3; }
.session-time { font-size: 0.625rem; color: var(--text-muted); }
.session-status { font-size: 0.625rem; padding: 2px 6px; border-radius: 4px; font-weight: 500; background: var(--bg-tertiary); color: var(--text-muted); }
.session-status.connected { color: var(--success); background: rgba(16, 185, 129, 0.1); }
.session-status.disconnected { color: var(--danger); background: rgba(239, 68, 68, 0.1); }

.btn-primary {
  width: 100%; padding: 0.625rem 1rem; background: var(--accent);
  border: none; border-radius: 8px; color: white; font-weight: 500;
  font-size: 0.875rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  transition: all 0.15s ease;
}
.btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); }
.btn-primary:active { transform: translateY(0); }
.icon { font-size: 1rem; font-weight: bold; }

#chat { flex: 1; display: flex; flex-direction: column; background: var(--bg-primary); min-width: 0; }
#plugins-view {
  flex: 1;
  min-width: 0;
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.06), transparent 18%), var(--bg-primary);
  overflow: hidden;
}

.plugins-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.25rem;
  gap: 1rem;
}

.plugins-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-end;
}

.plugins-toolbar-left h2 {
  font-size: 1.125rem;
  margin-bottom: 0.25rem;
}

.plugins-summary {
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.plugins-toolbar-actions {
  display: flex;
  gap: 0.625rem;
  align-items: center;
}

.plugins-toolbar-actions input {
  min-width: 160px;
  padding: 0.625rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.plugins-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 1rem;
}

.plugins-filters {
  overflow: auto;
  padding-right: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.filter-section {
  padding: 0.875rem;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(20, 20, 23, 0.85);
}

.filter-section-title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.filter-search-input {
  width: 100%;
  margin-bottom: 0.75rem;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.filter-tags,
.quick-filter-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.plugins-content {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.plugin-active-filters {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.75rem 0.875rem;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(20, 20, 23, 0.8);
}

.active-filter-summary {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.active-filter-list {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex: 1;
}

.active-filter-chip {
  border: 1px solid rgba(99, 102, 241, 0.28);
  background: rgba(99, 102, 241, 0.12);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.active-filter-remove {
  color: var(--text-secondary);
}

.clear-filters-btn {
  width: auto;
  white-space: nowrap;
}

.filter-tag-btn,
.quick-filter-btn {
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s ease;
}

.filter-count {
  margin-left: 0.4rem;
  color: var(--text-muted);
  font-size: 0.6875rem;
}

.filter-tag-btn:hover,
.quick-filter-btn:hover {
  border-color: var(--border-light);
  color: var(--text-primary);
}

.filter-tag-btn.active,
.quick-filter-btn.active {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--text-primary);
}

.filter-tag-btn.active .filter-count,
.quick-filter-btn.active .filter-count {
  color: var(--text-primary);
}

.plugins-status {
  padding: 0.75rem 0.875rem;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.22);
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.plugins-status.error {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.22);
  color: #fca5a5;
}

.plugins-grid {
  flex: 1;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  align-content: start;
}

.plugin-grid-spacer {
  grid-column: 1 / -1;
  pointer-events: none;
}

.plugin-card {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: rgba(20, 20, 23, 0.96);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
}

.plugin-card-top {
  display: flex;
  gap: 0.875rem;
  align-items: flex-start;
}

.plugin-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
}

.plugin-meta {
  min-width: 0;
  flex: 1;
}

.plugin-title-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.plugin-title-row h3 {
  font-size: 1rem;
  line-height: 1.2;
}

.plugin-subtitle,
.plugin-stats {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.plugin-description {
  color: var(--text-secondary);
  font-size: 0.875rem;
  min-height: 3.9em;
}

.plugin-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.plugin-tag {
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 0.6875rem;
}

.plugin-tag.muted {
  opacity: 0.75;
}

.plugin-badge {
  padding: 0.18rem 0.45rem;
  border-radius: 999px;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.plugin-badge.hot {
  background: rgba(245, 158, 11, 0.14);
  color: #fbbf24;
}

.plugin-badge.new {
  background: rgba(16, 185, 129, 0.14);
  color: #34d399;
}

.plugin-stats {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.plugin-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.plugin-progress {
  padding: 0.625rem 0.75rem;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.18);
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.plugin-detail-modal-content {
  max-width: 760px;
  width: min(92vw, 760px);
}

.plugin-detail-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.plugin-detail-summary {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.plugin-detail-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  flex-shrink: 0;
}

.plugin-detail-intro {
  min-width: 0;
  flex: 1;
}

.plugin-detail-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9375rem;
  line-height: 1.65;
}

.plugin-detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.plugin-detail-section h3 {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}

.plugin-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
}

.plugin-detail-stat {
  padding: 0.75rem 0.875rem;
  border-radius: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.plugin-detail-stat-label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.plugin-detail-stat-value {
  font-size: 0.875rem;
  color: var(--text-primary);
  word-break: break-word;
}

.plugin-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.plugin-detail-loading,
.plugin-detail-error {
  padding: 1rem;
  border-radius: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.plugin-detail-error {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.3);
}

.plugins-empty {
  padding: 2rem;
  border-radius: 16px;
  border: 1px dashed var(--border-light);
  color: var(--text-muted);
  text-align: center;
  grid-column: 1 / -1;
}

.plugins-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.75rem 0;
}

.plugins-pagination-left,
.plugins-pagination-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.plugins-page-size-label {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.plugins-page-size {
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.plugins-page-numbers {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.plugin-page-number {
  min-width: 2.25rem;
  padding: 0.5rem 0.625rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
}

.plugin-page-number.active {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--text-primary);
}

.plugins-page-ellipsis {
  color: var(--text-muted);
  padding: 0 0.25rem;
}

.plugins-page-summary {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.btn-secondary {
  padding: 0.625rem 0.875rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}

.plugin-link {
  text-decoration: none;
}

.plugin-action:disabled,
.btn-secondary:disabled,
.btn-primary:disabled,
.btn-danger:disabled {
  opacity: 0.55;
  cursor: wait;
}
#messages { flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }

.message { display: flex; gap: 0.75rem; max-width: 75%; animation: slideIn 0.2s ease-out; }
@keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.message.user { margin-left: auto; flex-direction: row-reverse; }

.message-avatar {
  width: 28px; height: 28px; border-radius: 6px; background: var(--bg-tertiary);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.875rem; flex-shrink: 0;
}
.message.user .message-avatar { background: var(--accent); }
.message-body { flex: 1; min-width: 0; }
.message-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
.message-role { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); }
.message-time { font-size: 0.625rem; color: var(--text-muted); }

.message-content {
  background: var(--bg-secondary); padding: 0.625rem 0.875rem; border-radius: 12px;
  line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  font-size: 0.9375rem; border: 1px solid var(--border);
}
.message.user .message-content { background: var(--accent); border-color: transparent; border-radius: 12px 12px 4px 12px; color: white; }
.message.assistant .message-content { border-radius: 12px 12px 12px 4px; }
.message.system .message-content { background: var(--bg-tertiary); color: var(--text-secondary); font-size: 0.8125rem; }
.message.error .message-content { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: #fca5a5; }

.streaming-cursor {
  display: inline-block; width: 2px; height: 1em; background: var(--accent);
  margin-left: 1px; animation: blink 0.8s infinite; vertical-align: text-bottom;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

.tool-block { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; margin: 0.25rem 0; overflow: hidden; font-size: 0.8125rem; }
.tool-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--bg-tertiary); font-weight: 500; }
.tool-icon { font-size: 0.875rem; }
.tool-name { font-family: 'SF Mono', Monaco, monospace; }
.tool-input, .tool-output {
  padding: 0.625rem 0.75rem; margin: 0; font-size: 0.75rem;
  overflow-x: auto; max-height: 150px; overflow-y: auto;
  font-family: 'SF Mono', Monaco, monospace; background: transparent;
}
.tool-result.error .tool-header { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
.inline-tool, .inline-result {
  display: inline-block; padding: 0.125rem 0.375rem; margin: 0.125rem 0;
  border-radius: 4px; font-size: 0.75rem; background: var(--bg-tertiary);
  font-family: 'SF Mono', Monaco, monospace;
}
.inline-result.error { background: rgba(239, 68, 68, 0.15); }

.thinking-block { opacity: 0.75; }
.thinking-content { font-style: italic; color: var(--text-muted); font-size: 0.8125rem; }

#input-area {
  padding: 0.875rem 1.25rem; background: var(--bg-secondary);
  border-top: 1px solid var(--border); display: flex; gap: 0.625rem; align-items: flex-end;
}

#input {
  flex: 1; padding: 0.625rem 0.875rem; border: 1px solid var(--border);
  border-radius: 10px; background: var(--bg-primary); color: var(--text-primary);
  font-size: 0.9375rem; font-family: inherit; resize: none;
  min-height: 42px; max-height: 120px; line-height: 1.5;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
#input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--glow); }
#input::placeholder { color: var(--text-muted); }
#input:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-send {
  width: 42px; height: 42px; border: none; border-radius: 10px;
  background: var(--accent); color: white; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease; flex-shrink: 0;
}
.btn-send:hover:not(:disabled) { background: var(--accent-hover); transform: scale(1.02); }
.btn-send:active:not(:disabled) { transform: scale(0.98); }
.btn-send:disabled { opacity: 0.4; cursor: not-allowed; }

#typing-indicator { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.25rem; color: var(--text-muted); font-size: 0.8125rem; }
#typing-indicator.hidden { display: none; }
.typing { display: flex; gap: 3px; align-items: center; }
.typing span { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: bounce 1.2s infinite; }
.typing span:nth-child(2) { animation-delay: 0.15s; }
.typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

.modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal.hidden { display: none; }
.modal-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px); }
.modal-content {
  position: relative; background: var(--bg-secondary); border-radius: 12px;
  max-width: 440px; width: 90%; max-height: 80vh; overflow: hidden;
  box-shadow: 0 25px 50px -12px var(--shadow); border: 1px solid var(--border);
  animation: modalIn 0.2s ease-out;
}
@keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(-10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 0.875rem 1.25rem; border-bottom: 1px solid var(--border); }
.modal-header h2 { font-size: 1rem; font-weight: 600; }
.modal-close { background: none; border: none; color: var(--text-muted); font-size: 1.25rem; cursor: pointer; padding: 0; line-height: 1; transition: color 0.15s; }
.modal-close:hover { color: var(--text-primary); }
.modal-body { padding: 1.25rem; overflow-y: auto; }
.modal-body p { margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.875rem; }
.modal-body pre { background: var(--bg-primary); padding: 0.75rem; border-radius: 8px; overflow-x: auto; font-size: 0.75rem; max-height: 200px; overflow-y: auto; border: 1px solid var(--border); }
.modal-footer { display: flex; gap: 0.5rem; justify-content: flex-end; padding: 0.875rem 1.25rem; border-top: 1px solid var(--border); }

.btn-success, .btn-danger { padding: 0.5rem 1rem; border: none; border-radius: 6px; font-weight: 500; font-size: 0.875rem; cursor: pointer; transition: all 0.15s; }
.btn-success { background: var(--success); color: white; }
.btn-success:hover { filter: brightness(1.1); }
.btn-danger { background: transparent; border: 1px solid var(--border); color: var(--text-secondary); }
.btn-danger:hover { background: var(--bg-hover); border-color: var(--danger); color: var(--danger); }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg-hover); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bg-active); }
* { scrollbar-width: thin; scrollbar-color: var(--bg-hover) transparent; }

@media (max-width: 768px) {
  #sidebar { display: none; }
  .message { max-width: 90%; }
  header { padding: 0.75rem 1rem; }
  h1 { font-size: 1rem; }
  .subtitle { display: none; }
  .plugins-shell { padding: 1rem; }
  .plugins-toolbar { flex-direction: column; align-items: stretch; }
  .plugins-toolbar-actions { flex-direction: column; align-items: stretch; }
  .plugins-toolbar-actions input,
  .btn-secondary { width: 100%; }
  .plugins-layout { grid-template-columns: 1fr; }
  .plugins-filters { max-height: 38vh; }
}`
  return new Response(css, {
    headers: { 'Content-Type': 'text/css' },
  })
}
