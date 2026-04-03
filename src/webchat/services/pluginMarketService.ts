/**
 * Plugin Market Service
 *
 * Provides plugin marketplace functionality for the webchat interface.
 * Integrates with the existing plugin operations and skill loading system.
 */

import {
  installPluginOp,
  uninstallPluginOp,
  enablePluginOp,
  disablePluginOp,
  updatePluginOp,
  type InstallableScope,
  type PluginOperationResult,
  type PluginUpdateResult,
  VALID_INSTALLABLE_SCOPES,
} from '../../services/plugins/pluginOperations.js'
import {
  getMarketplace,
  getPluginById,
  loadKnownMarketplacesConfig,
} from '../../utils/plugins/marketplaceManager.js'
import {
  loadInstalledPluginsV2,
  loadInstalledPluginsFromDisk,
} from '../../utils/plugins/installedPluginsManager.js'
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js'
import { clearSkillCaches } from '../../skills/loadSkillsDir.js'
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js'
import { parsePluginIdentifier } from '../../utils/plugins/pluginIdentifier.js'
import type { PluginMarketplaceEntry } from '../../utils/plugins/schemas.js'
import {
  getClawHubMarketplaceEntry,
  isClawHubPluginId,
  listClawHubMarketplaceEntries,
  clearClawHubCache,
  isClawHubCacheHydrated,
  onClawHubCacheHydrated,
} from './clawhubMarketService.js'

// ============================================================================
// Types
// ============================================================================

export interface PluginMarketEntry {
  /** Plugin ID (name@marketplace) */
  id: string
  /** Display name */
  name: string
  /** Icon emoji */
  icon: string
  /** Description */
  description: string
  /** Domain categories */
  categories: string[]
  /** Tech stack tags */
  techStack: string[]
  /** Business domains */
  businessDomains: string[]
  /** Primary role label */
  role: string
  /** Tags for search */
  tags: string[]
  /** Current version */
  version: string
  /** Author name */
  author: string
  /** Download count (approximate) */
  downloads: number
  /** Rating (0-5) */
  rating: number
  /** Is installed */
  installed: boolean
  /** Is enabled */
  enabled: boolean
  /** Is hot/trending */
  hot: boolean
  /** Is new */
  new: boolean
  /** Marketplace source */
  marketplace: string
  /** Whether this entry can be installed through native plugin ops */
  installable?: boolean
  /** External URL for community sources */
  externalUrl?: string
  /** Source type */
  sourceType?: 'native' | 'community'
}

export interface PluginFilters {
  /** 1-based page number */
  page?: number
  /** Page size */
  pageSize?: number
  /** Filter by concrete marketplace id */
  marketplace?: string
  /** Filter by source bucket */
  source?: string
  /** Filter by category */
  category?: string
  /** Filter by tech stack */
  techStack?: string
  /** Filter by role */
  role?: string
  /** Filter by business domain */
  businessDomain?: string
  /** Search query */
  search?: string
  /** Quick filter */
  filter?: 'all' | 'hot' | 'new' | 'installed'
}

export interface PluginFacetItem {
  id: string
  count: number
}

export interface PluginMarketFacets {
  quickFilters: PluginFacetItem[]
  sources: PluginFacetItem[]
  marketplaces: PluginFacetItem[]
  categories: PluginFacetItem[]
  roles: PluginFacetItem[]
  techStack: PluginFacetItem[]
  businessDomains: PluginFacetItem[]
}

export interface PaginatedPluginMarketResult {
  items: PluginMarketEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PluginInstallRequest {
  pluginId: string
  scope: InstallableScope
}

export interface PluginUninstallRequest {
  pluginId: string
  scope: InstallableScope
  keepData?: boolean
}

export interface PluginToggleRequest {
  pluginId: string
  enabled: boolean
  scope?: InstallableScope
}

export interface PluginUpdateRequest {
  pluginId: string
  scope: 'user' | 'project' | 'local' | 'managed'
}

// ============================================================================
// Constants
// ============================================================================

/** Category icons mapping */
const CATEGORY_ICONS: Record<string, string> = {
  agent: '🤖',
  architecture: '🏗️',
  backend: '⚙️',
  frontend: '🎨',
  testing: '🧪',
  security: '🔒',
  data: '📊',
  devops: '🚀',
  docs: '📝',
  finance: '💹',
  accounting: '🧾',
  hr: '🧑‍💼',
  legal: '⚖️',
  operations: '📈',
  default: '📦',
}

/** Tech stack icons mapping */
const TECH_STACK_ICONS: Record<string, string> = {
  python: '🐍',
  javascript: '📦',
  typescript: '📘',
  rust: '🦀',
  go: '🐹',
  java: '☕',
  react: '⚛️',
  vue: '💚',
  nodejs: '💚',
  default: '💻',
}

const ROLE_ICONS: Record<string, string> = {
  specialist: '🎯',
  orchestrator: '🎼',
  workflow: '🔄',
  'frontend-engineer': '🎨',
  'backend-engineer': '⚙️',
  'fullstack-engineer': '🧩',
  architect: '🏗️',
  'ai-engineer': '🤖',
  'data-engineer': '📊',
  'test-engineer': '🧪',
  sre: '🚀',
  'security-engineer': '🔒',
  'finance-analyst': '💹',
  accountant: '🧾',
  'hr-specialist': '🧑‍💼',
  legal: '⚖️',
  operations: '📈',
  other: '📦',
}

const BUSINESS_DOMAIN_ICONS: Record<string, string> = {
  api: '🔌',
  contracts: '📄',
  recruiting: '🧲',
  payroll: '💵',
  'fp-and-a': '📉',
  compliance: '✅',
  'customer-support': '🎧',
  crm: '🤝',
}

/** Hot plugins (manually curated for now) */
const HOT_PLUGINS = new Set([
  'python-pro',
  'typescript-pro',
  'architecture',
  'frontend-developer',
  'devops-engineer',
  'agent-manager',
  'react-expert',
  'golang-pro',
])

/** New plugins (recently added) */
const NEW_PLUGINS = new Set([
  'test-master',
  'rust-engineer',
  'vue-expert',
])

const OFFICIAL_MARKETPLACES = new Set([
  'claude-plugins-official',
  'agent-skills',
  'knowledge-work-plugins',
  'life-sciences',
])

const MARKET_CACHE_TTL_MS = 60 * 1000

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const marketListCache = new Map<string, CacheEntry<PluginMarketEntry[]>>()
const marketFacetsCache = new Map<string, CacheEntry<PluginMarketFacets>>()
const marketPluginCache = new Map<string, CacheEntry<PluginMarketEntry | null>>()

function logPluginMarketCache(message: string): void {
  void message
}

function clearDerivedMarketCaches(reason: string): void {
  marketListCache.clear()
  marketFacetsCache.clear()
  logPluginMarketCache(`clear derived reason=${reason}`)
}

onClawHubCacheHydrated(() => {
  clearDerivedMarketCaches('clawhub_hydrated')
})

// ============================================================================
// Plugin Market Service
// ============================================================================

/**
 * List all available plugins from configured marketplaces
 */
export async function listMarketPlugins(
  filters: PluginFilters = {},
): Promise<PluginMarketEntry[]> {
  const cacheKey = getFilterCacheKey(filters)
  const cached = marketListCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    logPluginMarketCache(`hit list key=${cacheKey} ttl_ms=${cached.expiresAt - Date.now()} items=${cached.value.length}`)
    return cached.value
  }

  if (cached) {
    logPluginMarketCache(`expired list key=${cacheKey}`)
  } else {
    logPluginMarketCache(`miss list key=${cacheKey}`)
  }

  const plugins: PluginMarketEntry[] = []

  // Load installed plugins status
  const installedData = loadInstalledPluginsV2()
  const { enabled, disabled } = await loadAllPlugins()
  const allLoaded = [...enabled, ...disabled]

  // Get all plugins from all configured marketplaces
  const marketplaces = await loadKnownMarketplacesConfig()

  for (const [marketplaceName] of Object.entries(marketplaces)) {
    try {
      const marketplace = await getMarketplace(marketplaceName)

      for (const entry of marketplace.plugins) {
        const pluginId = `${entry.name}@${marketplaceName}`

        // Check installation status
        const installations = installedData.plugins[pluginId]
        const isInstalled = installations && installations.length > 0

        // Check if enabled
        const loadedPlugin = allLoaded.find(p => p.name === pluginId || p.name === entry.name)
        const isEnabled = loadedPlugin !== undefined && enabled.includes(loadedPlugin)

        // Extract categories and tech stack from manifest/entry
        const categories = extractCategories(entry)
        const techStack = extractTechStack(entry)
        const businessDomains = extractBusinessDomains(entry)
        const role = extractRole(entry)

        const marketEntry: PluginMarketEntry = {
          id: pluginId,
          name: entry.name,
          icon: extractIcon(entry, categories[0]),
          description: entry.description ?? '',
          categories,
          techStack,
          businessDomains,
          role,
          tags: extractTags(entry),
          version: entry.version ?? '1.0.0',
          author: entry.author ?? 'Unknown',
          downloads: estimateDownloads(entry),
          rating: estimateRating(entry),
          installed: isInstalled,
          enabled: isEnabled,
          hot: HOT_PLUGINS.has(entry.name),
          new: NEW_PLUGINS.has(entry.name),
          marketplace: marketplaceName,
        }

        plugins.push(marketEntry)
      }
    } catch (error) {
      console.error(`Failed to load marketplace ${marketplaceName}:`, error)
    }
  }

  // Apply filters
  const clawHubEntries = await listClawHubMarketplaceEntries().catch(() => [])
  const result = filterPlugins([...plugins, ...clawHubEntries], filters)
  if (isClawHubCacheHydrated()) {
    marketListCache.set(cacheKey, {
      expiresAt: Date.now() + MARKET_CACHE_TTL_MS,
      value: result,
    })
    logPluginMarketCache(`store list key=${cacheKey} ttl_ms=${MARKET_CACHE_TTL_MS} items=${result.length}`)
  } else {
    logPluginMarketCache(`skip store list key=${cacheKey} reason=clawhub_not_hydrated items=${result.length}`)
  }
  return result
}

export async function listMarketPluginsPage(
  filters: PluginFilters = {},
): Promise<PaginatedPluginMarketResult> {
  const allItems = await listMarketPlugins(filters)
  const pageSize = normalizePageSize(filters.pageSize)
  const total = allItems.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = normalizePage(filters.page, totalPages)
  const start = (page - 1) * pageSize

  return {
    items: allItems.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  }
}

export async function getMarketPluginFacets(
  filters: PluginFilters = {},
): Promise<PluginMarketFacets> {
  const cacheKey = getFacetCacheKey(filters)
  const cached = marketFacetsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    logPluginMarketCache(`hit facets key=${cacheKey} ttl_ms=${cached.expiresAt - Date.now()}`)
    return cached.value
  }

  if (cached) {
    logPluginMarketCache(`expired facets key=${cacheKey}`)
  } else {
    logPluginMarketCache(`miss facets key=${cacheKey}`)
  }

  const baseFilters: PluginFilters = {
    search: filters.search,
  }
  const plugins = await listMarketPlugins(baseFilters)
  const quickFilterBase = filterPlugins([...plugins], {
    ...baseFilters,
    category: filters.category,
    role: filters.role,
    techStack: filters.techStack,
    businessDomain: filters.businessDomain,
  })

  const result = {
    quickFilters: [
      { id: 'all', count: quickFilterBase.length },
      { id: 'hot', count: quickFilterBase.filter(plugin => plugin.hot).length },
      { id: 'new', count: quickFilterBase.filter(plugin => plugin.new).length },
      { id: 'installed', count: quickFilterBase.filter(plugin => plugin.installed).length },
    ],
    sources: countFacetValues(
      filterPlugins([...plugins], {
        ...baseFilters,
        filter: filters.filter,
        marketplace: filters.marketplace,
        category: filters.category,
        role: filters.role,
        techStack: filters.techStack,
        businessDomain: filters.businessDomain,
      }).map(plugin => getSourceFacetId(plugin)).filter(Boolean),
    ),
    marketplaces: countFacetValues(
      filterPlugins([...plugins], {
        ...baseFilters,
        source: filters.source,
        filter: filters.filter,
        category: filters.category,
        role: filters.role,
        techStack: filters.techStack,
        businessDomain: filters.businessDomain,
      }).map(plugin => plugin.marketplace).filter(Boolean),
    ),
    categories: countFacetValues(
      filterPlugins([...plugins], {
        ...baseFilters,
        marketplace: filters.marketplace,
        source: filters.source,
        filter: filters.filter,
        role: filters.role,
        techStack: filters.techStack,
        businessDomain: filters.businessDomain,
      }).flatMap(plugin => plugin.categories || []),
    ),
    roles: countFacetValues(
      filterPlugins([...plugins], {
        ...baseFilters,
        marketplace: filters.marketplace,
        source: filters.source,
        filter: filters.filter,
        category: filters.category,
        techStack: filters.techStack,
        businessDomain: filters.businessDomain,
      }).map(plugin => plugin.role).filter(Boolean),
    ),
    techStack: countFacetValues(
      filterPlugins([...plugins], {
        ...baseFilters,
        marketplace: filters.marketplace,
        source: filters.source,
        filter: filters.filter,
        category: filters.category,
        role: filters.role,
        businessDomain: filters.businessDomain,
      }).flatMap(plugin => plugin.techStack || []),
    ),
    businessDomains: countFacetValues(
      filterPlugins([...plugins], {
        ...baseFilters,
        marketplace: filters.marketplace,
        source: filters.source,
        filter: filters.filter,
        category: filters.category,
        role: filters.role,
        techStack: filters.techStack,
      }).flatMap(plugin => plugin.businessDomains || []),
    ),
  }
  if (isClawHubCacheHydrated()) {
    marketFacetsCache.set(cacheKey, {
      expiresAt: Date.now() + MARKET_CACHE_TTL_MS,
      value: result,
    })
    logPluginMarketCache(`store facets key=${cacheKey} ttl_ms=${MARKET_CACHE_TTL_MS}`)
  } else {
    logPluginMarketCache(`skip store facets key=${cacheKey} reason=clawhub_not_hydrated`)
  }
  return result
}

/**
 * Get a single plugin by ID
 */
export async function getMarketPlugin(pluginId: string): Promise<PluginMarketEntry | null> {
  const cached = marketPluginCache.get(pluginId)
  if (cached && cached.expiresAt > Date.now()) {
    logPluginMarketCache(`hit detail plugin=${pluginId} ttl_ms=${cached.expiresAt - Date.now()}`)
    return cached.value
  }

  if (cached) {
    logPluginMarketCache(`expired detail plugin=${pluginId}`)
  } else {
    logPluginMarketCache(`miss detail plugin=${pluginId}`)
  }

  if (isClawHubPluginId(pluginId)) {
    const result = await getClawHubMarketplaceEntry(pluginId)
    marketPluginCache.set(pluginId, {
      expiresAt: Date.now() + MARKET_CACHE_TTL_MS,
      value: result,
    })
    logPluginMarketCache(`store detail plugin=${pluginId} ttl_ms=${MARKET_CACHE_TTL_MS}`)
    return result
  }

  const { name, marketplace: marketplaceName } = parsePluginIdentifier(pluginId)

  if (!marketplaceName) {
    return null
  }

  const pluginInfo = await getPluginById(pluginId)
  if (!pluginInfo) {
    return null
  }

  const { entry } = pluginInfo
  const installedData = loadInstalledPluginsV2()
  const installations = installedData.plugins[pluginId]
  const isInstalled = installations && installations.length > 0

  const { enabled, disabled } = await loadAllPlugins()
  const allLoaded = [...enabled, ...disabled]
  const loadedPlugin = allLoaded.find(p => p.name === pluginId || p.name === entry.name)
  const isEnabled = loadedPlugin !== undefined && enabled.includes(loadedPlugin)

  const categories = extractCategories(entry)
  const techStack = extractTechStack(entry)
  const businessDomains = extractBusinessDomains(entry)

  const result = {
    id: pluginId,
    name: entry.name,
    icon: extractIcon(entry, categories[0]),
    description: entry.description ?? '',
    categories,
    techStack,
    businessDomains,
    role: extractRole(entry),
    tags: extractTags(entry),
    version: entry.version ?? '1.0.0',
    author: entry.author ?? 'Unknown',
    downloads: estimateDownloads(entry),
    rating: estimateRating(entry),
    installed: isInstalled,
    enabled: isEnabled,
    hot: HOT_PLUGINS.has(entry.name),
    new: NEW_PLUGINS.has(entry.name),
    marketplace: marketplaceName,
    installable: true,
    sourceType: 'native',
  }
  marketPluginCache.set(pluginId, {
    expiresAt: Date.now() + MARKET_CACHE_TTL_MS,
    value: result,
  })
  logPluginMarketCache(`store detail plugin=${pluginId} ttl_ms=${MARKET_CACHE_TTL_MS}`)
  return result
}

/**
 * Install a plugin
 */
export async function installPlugin(
  request: PluginInstallRequest,
): Promise<PluginOperationResult> {
  if (isClawHubPluginId(request.pluginId)) {
    return {
      success: false,
      message: 'ClawHub community entries are browse-only for now. Open the external page to install.',
    }
  }
  const result = await installPluginOp(request.pluginId, request.scope)

  if (result.success) {
    // Clear caches to reload skills
    clearAllCaches()
    clearSkillCaches()
    clearPluginMarketCaches()
  }

  return result
}

/**
 * Uninstall a plugin
 */
export async function uninstallPlugin(
  request: PluginUninstallRequest,
): Promise<PluginOperationResult> {
  if (isClawHubPluginId(request.pluginId)) {
    return {
      success: false,
      message: 'ClawHub community entries are not managed by the native installer.',
    }
  }
  const result = await uninstallPluginOp(
    request.pluginId,
    request.scope,
    !request.keepData,
  )

  if (result.success) {
    // Clear caches to reload skills
    clearAllCaches()
    clearSkillCaches()
    clearPluginMarketCaches()
  }

  return result
}

/**
 * Enable or disable a plugin
 */
export async function togglePlugin(
  request: PluginToggleRequest,
): Promise<PluginOperationResult> {
  if (isClawHubPluginId(request.pluginId)) {
    return {
      success: false,
      message: 'ClawHub community entries do not support enable/disable through native plugin ops.',
    }
  }
  const result = request.enabled
    ? await enablePluginOp(request.pluginId, request.scope)
    : await disablePluginOp(request.pluginId, request.scope)

  if (result.success) {
    // Clear caches to reload skills
    clearAllCaches()
    clearSkillCaches()
    clearPluginMarketCaches()
  }

  return result
}

/**
 * Update a plugin to the latest version
 */
export async function updatePlugin(
  request: PluginUpdateRequest,
): Promise<PluginUpdateResult> {
  if (isClawHubPluginId(request.pluginId)) {
    return {
      success: false,
      message: 'ClawHub community entries are browse-only for now.',
    }
  }
  const result = await updatePluginOp(request.pluginId, request.scope)

  if (result.success) {
    // Clear caches to reload skills
    clearAllCaches()
    clearSkillCaches()
    clearPluginMarketCaches()
  }

  return result
}

/**
 * Get installed plugins with their status
 */
export async function getInstalledPlugins(): Promise<PluginMarketEntry[]> {
  const installedData = loadInstalledPluginsFromDisk()
  const plugins: PluginMarketEntry[] = []

  const { enabled, disabled } = await loadAllPlugins()
  const allLoaded = [...enabled, ...disabled]

  for (const [pluginId, installations] of Object.entries(installedData.plugins)) {
    if (installations.length === 0) continue

    const { name, marketplace } = parsePluginIdentifier(pluginId)
    const loadedPlugin = allLoaded.find(
      p => p.name === pluginId
        || p.name === name
        || ('source' in p && typeof p.source === 'string' && p.source === pluginId)
        || ('source' in p && typeof p.source === 'string' && marketplace !== null && p.source.endsWith(`@${marketplace}`) && p.name === name),
    )
    const isEnabled = loadedPlugin !== undefined && enabled.includes(loadedPlugin)

    plugins.push({
      id: pluginId,
      name,
      icon: '📦',
      description: loadedPlugin?.description ?? '',
      categories: [],
      techStack: [],
      businessDomains: [],
      role: 'other',
      tags: [],
      version: installations[0]?.version ?? 'unknown',
      author: 'Unknown',
      downloads: 0,
      rating: 0,
      installed: true,
      enabled: isEnabled,
      hot: false,
      new: false,
      marketplace: parsePluginIdentifier(pluginId).marketplace ?? 'unknown',
      installable: true,
      sourceType: 'native',
    })
  }

  return plugins
}

export function clearPluginMarketCaches(): void {
  clearDerivedMarketCaches('manual')
  marketPluginCache.clear()
  clearClawHubCache()
  logPluginMarketCache('clear all')
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Filter plugins based on criteria
 */
function filterPlugins(
  plugins: PluginMarketEntry[],
  filters: PluginFilters,
): PluginMarketEntry[] {
  let result = plugins

  if (filters.marketplace && filters.marketplace !== 'all') {
    result = result.filter(p => p.marketplace === filters.marketplace)
  }

  if (filters.source && filters.source !== 'all') {
    result = result.filter(p => getSourceFacetId(p) === filters.source)
  }

  // Category filter
  if (filters.category && filters.category !== 'all') {
    result = result.filter(p => p.categories.includes(filters.category!))
  }

  // Tech stack filter
  if (filters.techStack && filters.techStack !== 'all') {
    result = result.filter(p => p.techStack.includes(filters.techStack!))
  }

  // Role filter
  if (filters.role && filters.role !== 'all') {
    result = result.filter(p => p.role === filters.role)
  }

  // Business domain filter
  if (filters.businessDomain && filters.businessDomain !== 'all') {
    result = result.filter(p => p.businessDomains.includes(filters.businessDomain!))
  }

  // Quick filters
  if (filters.filter === 'hot') {
    result = result.filter(p => p.hot)
  } else if (filters.filter === 'new') {
    result = result.filter(p => p.new)
  } else if (filters.filter === 'installed') {
    result = result.filter(p => p.installed)
  }

  // Search filter
  if (filters.search) {
    const query = filters.search.toLowerCase()
    result = result.filter(
      p =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.tags.some(t => t.toLowerCase().includes(query)) ||
        p.categories.some(c => c.toLowerCase().includes(query)) ||
        p.techStack.some(t => t.toLowerCase().includes(query)) ||
        p.businessDomains.some(d => d.toLowerCase().includes(query)) ||
        p.role.toLowerCase().includes(query),
    )
  }

  // Sort: installed first, then by downloads
  return result.sort((a, b) => {
    if (a.installed !== b.installed) {
      return a.installed ? -1 : 1
    }
    return b.downloads - a.downloads
  })
}

/**
 * Extract categories from plugin entry
 */
function extractCategories(entry: PluginMarketplaceEntry): string[] {
  const explicit = normalizeExplicitList([
    entry.category,
    ...(entry.tags ?? []),
  ]).filter(tag => CATEGORY_ICONS[tag] !== undefined)
  if (explicit.length > 0) {
    return dedupe(explicit)
  }

  const categories: string[] = []

  // Try to extract from manifest keywords or name
  const name = entry.name.toLowerCase()
  const keywords = entry.keywords ?? []

  // Category detection based on name/keywords
  const categoryPatterns: Array<[string, RegExp]> = [
    ['agent', /agent|orchestrat|swarm/i],
    ['architecture', /architect|design|pattern/i],
    ['backend', /backend|api|server|microservice/i],
    ['frontend', /frontend|ui|react|vue|angular|css/i],
    ['testing', /test|e2e|unit|integration/i],
    ['security', /security|auth|owasp|vulnerability/i],
    ['data', /data|database|sql|nosql|analytics/i],
    ['devops', /devops|ci|cd|docker|kubernetes|deploy/i],
    ['docs', /doc|markdown|readme|document/i],
    ['finance', /finance|financial|finops|treasury|budget/i],
    ['accounting', /accounting|bookkeep|ledger|invoice|tax/i],
    ['hr', /human[\s-]?resources|hr|recruit|hiring|talent|people\s*ops/i],
    ['legal', /legal|contract|compliance|policy|privacy|regulation/i],
    ['operations', /operations|ops|workflow|process|support|customer\s*success/i],
  ]

  for (const [category, pattern] of categoryPatterns) {
    if (pattern.test(name) || keywords.some(k => pattern.test(k))) {
      categories.push(category)
    }
  }

  return categories.length > 0 ? categories : ['other']
}

/**
 * Extract tech stack from plugin entry
 */
function extractTechStack(entry: PluginMarketplaceEntry): string[] {
  const explicit = normalizeExplicitList([
    ...(entry.tags ?? []),
    ...(entry.keywords ?? []),
  ]).filter(tag => TECH_STACK_ICONS[tag] !== undefined)
  if (explicit.length > 0) {
    return dedupe(explicit)
  }

  const techStack: string[] = []
  const name = entry.name.toLowerCase()
  const keywords = entry.keywords ?? []

  const techPatterns: Array<[string, RegExp]> = [
    ['python', /python|django|flask|fastapi|pytest/i],
    ['javascript', /javascript|typescript|js|ts|node/i],
    ['rust', /rust|cargo/i],
    ['go', /golang|go\s*lang/i],
    ['java', /java|spring|kotlin/i],
    ['react', /react|next\.?js/i],
    ['vue', /vue|nuxt/i],
  ]

  for (const [tech, pattern] of techPatterns) {
    if (pattern.test(name) || keywords.some(k => pattern.test(k))) {
      techStack.push(tech)
    }
  }

  return techStack
}

/**
 * Extract role from plugin entry
 */
function extractRole(entry: PluginMarketplaceEntry): PluginMarketEntry['role'] {
  const name = entry.name.toLowerCase()
  const keywords = entry.keywords ?? []
  const explicit = dedupe([
    ...normalizeExplicitList(entry.roles ?? []),
    ...normalizeExplicitList(entry.tags ?? []),
  ]).find(tag => ROLE_ICONS[tag] !== undefined)
  if (explicit) {
    return explicit
  }
  const haystack = [name, ...keywords].join(' ')

  const rolePatterns: Array<[string, RegExp]> = [
    ['frontend-engineer', /frontend|react|vue|ui|css/i],
    ['backend-engineer', /backend|api|server|microservice|database/i],
    ['fullstack-engineer', /full[\s-]?stack/i],
    ['architect', /architect|architecture|design\s+system|system\s+design/i],
    ['ai-engineer', /ai|llm|agent|prompt|rag|model/i],
    ['data-engineer', /data|etl|warehouse|analytics|sql/i],
    ['test-engineer', /test|qa|e2e|integration|unit/i],
    ['security-engineer', /security|auth|owasp|vulnerability|iam/i],
    ['sre', /sre|devops|infra|kubernetes|observability|deploy/i],
    ['finance-analyst', /finance|financial|fp&a|budget|forecast|valuation/i],
    ['accountant', /accounting|bookkeep|ledger|invoice|tax|payroll/i],
    ['hr-specialist', /human[\s-]?resources|hr|recruit|talent|people\s*ops/i],
    ['legal', /legal|contract|compliance|policy|privacy|regulation/i],
    ['operations', /operations|ops|support|customer\s*success|process/i],
  ]

  for (const [role, pattern] of rolePatterns) {
    if (pattern.test(haystack)) {
      return role
    }
  }

  if (/orchestrat|manager|coordinator/i.test(name) || keywords.some(k => /orchestrat|manager/i.test(k))) {
    return 'orchestrator'
  }
  if (/workflow|pipeline|automation/i.test(name) || keywords.some(k => /workflow|pipeline/i.test(k))) {
    return 'workflow'
  }
  if (/expert|pro|specialist|senior|architect/i.test(name)) {
    return 'specialist'
  }
  return 'other'
}

function extractBusinessDomains(entry: PluginMarketplaceEntry): string[] {
  const explicit = dedupe([
    ...normalizeExplicitList(entry.businessDomains ?? []),
    ...normalizeExplicitList(entry.tags ?? []),
  ]).filter(tag => BUSINESS_DOMAIN_ICONS[tag] !== undefined)
  if (explicit.length > 0) {
    return explicit
  }

  const domains: string[] = []
  const name = entry.name.toLowerCase()
  const keywords = entry.keywords ?? []

  const domainPatterns: Array<[string, RegExp]> = [
    ['api', /api|postman|rest|graphql|integration/i],
    ['contracts', /contract|legal|nda|procurement/i],
    ['recruiting', /recruit|hiring|candidate|talent/i],
    ['payroll', /payroll|compensation|salary|benefits/i],
    ['fp-and-a', /fp&a|budget|forecast|financial|valuation/i],
    ['compliance', /compliance|policy|privacy|regulation|audit/i],
    ['customer-support', /support|ticket|customer\s*success|helpdesk/i],
    ['crm', /crm|sales|pipeline|lead/i],
  ]

  for (const [domain, pattern] of domainPatterns) {
    if (pattern.test(name) || keywords.some(k => pattern.test(k))) {
      domains.push(domain)
    }
  }

  return dedupe(domains)
}

/**
 * Extract icon for plugin
 */
function extractIcon(entry: PluginMarketplaceEntry, category?: string): string {
  // First check tech stack
  const techStack = extractTechStack(entry)
  if (techStack.length > 0) {
    return TECH_STACK_ICONS[techStack[0]!] ?? TECH_STACK_ICONS.default!
  }

  const role = extractRole(entry)
  if (role && role !== 'other') {
    return ROLE_ICONS[role] ?? ROLE_ICONS.other!
  }

  const businessDomains = extractBusinessDomains(entry)
  if (businessDomains.length > 0) {
    return BUSINESS_DOMAIN_ICONS[businessDomains[0]!] ?? CATEGORY_ICONS.default!
  }

  // Then check category
  if (category) {
    return CATEGORY_ICONS[category] ?? CATEGORY_ICONS.default!
  }

  return CATEGORY_ICONS.default!
}

/**
 * Extract tags from plugin entry
 */
function extractTags(entry: PluginMarketplaceEntry): string[] {
  const tags: string[] = []

  if (entry.tags) {
    tags.push(...entry.tags.slice(0, 8))
  }

  if (entry.keywords) {
    tags.push(...entry.keywords.slice(0, 5))
  }

  return dedupe(tags)
}

/**
 * Estimate download count (placeholder for now)
 */
function estimateDownloads(entry: PluginMarketplaceEntry): number {
  // In a real implementation, this would come from analytics
  // For now, use a simple heuristic based on name popularity
  const popularPlugins = new Set([
    'python-pro',
    'typescript-pro',
    'architecture',
    'frontend-developer',
  ])

  if (popularPlugins.has(entry.name)) {
    return Math.floor(Math.random() * 5000) + 10000 // 10k-15k
  }

  return Math.floor(Math.random() * 5000) + 1000 // 1k-6k
}

/**
 * Estimate rating (placeholder for now)
 */
function estimateRating(entry: PluginMarketplaceEntry): number {
  // In a real implementation, this would come from user reviews
  // For now, return a reasonable default
  return Math.round((Math.random() * 0.5 + 4.3) * 10) / 10 // 4.3-4.8
}

/**
 * Get valid installable scopes
 */
export function getValidScopes(): readonly InstallableScope[] {
  return VALID_INSTALLABLE_SCOPES
}

function normalizeExplicitList(values: Array<string | undefined>): string[] {
  return values
    .flatMap(value => value ? value.split(/[,\s/]+/) : [])
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

function countFacetValues(values: string[]): PluginFacetItem[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
}

function getSourceFacetId(plugin: PluginMarketEntry): string {
  if (plugin.sourceType === 'community') {
    return 'community'
  }
  if (OFFICIAL_MARKETPLACES.has(plugin.marketplace)) {
    return 'official'
  }
  return 'custom'
}

function normalizePage(value: number | undefined, totalPages: number): number {
  const page = Number.isFinite(value) ? Math.trunc(value as number) : 1
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1))
}

function normalizePageSize(value: number | undefined): number {
  const pageSize = Number.isFinite(value) ? Math.trunc(value as number) : 36
  return Math.min(Math.max(pageSize, 12), 100)
}

function getFilterCacheKey(filters: PluginFilters): string {
  return JSON.stringify({
    marketplace: filters.marketplace ?? 'all',
    source: filters.source ?? 'all',
    category: filters.category ?? 'all',
    techStack: filters.techStack ?? 'all',
    role: filters.role ?? 'all',
    businessDomain: filters.businessDomain ?? 'all',
    search: filters.search ?? '',
    filter: filters.filter ?? 'all',
  })
}

function getFacetCacheKey(filters: PluginFilters): string {
  return JSON.stringify({
    marketplace: filters.marketplace ?? 'all',
    source: filters.source ?? 'all',
    category: filters.category ?? 'all',
    techStack: filters.techStack ?? 'all',
    role: filters.role ?? 'all',
    businessDomain: filters.businessDomain ?? 'all',
    search: filters.search ?? '',
    filter: filters.filter ?? 'all',
  })
}
