/**
 * ClawHub community marketplace adapter.
 *
 * Phase 1 is intentionally read-only:
 * - list public skills
 * - map them into the internal marketplace card model
 * - expose external URLs instead of forcing them through native install ops
 */

const CLAWHUB_MARKETPLACE_NAME = 'clawhub-community'
const CLAWHUB_SITE_URL = 'https://clawhub.ai'
const CLAWHUB_CONVEX_URL = 'https://wry-manatee-359.convex.cloud'
const CLAWHUB_PAGE_SIZE = 50
const CLAWHUB_INITIAL_ITEMS = 50
const CLAWHUB_MAX_ITEMS = 600
const CACHE_TTL_MS = 5 * 60 * 1000

type ClawHubStats = {
  downloads?: number
  installsAllTime?: number
  stars?: number
}

type ClawHubSkillRecord = {
  skill: {
    _id: string
    slug: string
    displayName?: string
    summary?: string
    stats?: ClawHubStats
    badges?: {
      highlighted?: boolean
      official?: boolean
      deprecated?: boolean
    }
  }
  latestVersion?: {
    version?: string
  }
  owner?: {
    handle?: string
    displayName?: string
    name?: string
  }
  ownerHandle?: string
}

type ClawHubListResponse = {
  page: ClawHubSkillRecord[]
  hasMore: boolean
  nextCursor?: string | null
}

type ClawHubSkillDetail = {
  owner?: {
    handle?: string
    displayName?: string
    name?: string
  }
  skill?: ClawHubSkillRecord['skill'] & {
    tags?: Record<string, string>
  }
  latestVersion?: {
    version?: string
    parsed?: Record<string, unknown>
    llmAnalysis?: {
      summary?: string
    }
    staticScan?: {
      status?: string
    }
  }
}

type CommunityMarketplaceEntry = {
  id: string
  name: string
  icon: string
  description: string
  categories: string[]
  techStack: string[]
  businessDomains: string[]
  role: string
  tags: string[]
  version: string
  author: string
  downloads: number
  rating: number
  installed: boolean
  enabled: boolean
  hot: boolean
  new: boolean
  marketplace: string
  installable: boolean
  externalUrl: string
  sourceType: 'community'
}

let cache:
  | {
      expiresAt: number
      entries: CommunityMarketplaceEntry[]
      hydrated: boolean
      nextCursor?: string | null
    }
  | undefined

const detailCache = new Map<string, {
  expiresAt: number
  entry: CommunityMarketplaceEntry
}>()
let backgroundHydrationPromise: Promise<void> | null = null
const hydrationListeners = new Set<() => void>()

function logClawHubCache(message: string): void {
  console.log(`[ClawHubCache] ${message}`)
}

async function clawHubQuery<T>(path: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${CLAWHUB_CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      args,
      format: 'json',
    }),
  })

  if (!response.ok) {
    throw new Error(`ClawHub query failed with HTTP ${response.status}`)
  }

  const payload = await response.json() as {
    status: 'success' | 'error'
    value?: T
    errorMessage?: string
  }

  if (payload.status !== 'success' || payload.value === undefined) {
    throw new Error(payload.errorMessage || 'ClawHub query failed')
  }

  return payload.value
}

function categorizeSkill(record: ClawHubSkillRecord): {
  categories: string[]
  techStack: string[]
  businessDomains: string[]
  role: string
  tags: string[]
  icon: string
} {
  const slug = record.skill.slug.toLowerCase()
  const summary = (record.skill.summary || '').toLowerCase()
  const haystack = `${slug} ${summary}`
  const tags = new Set<string>(['community', 'skill'])
  const categories: string[] = ['agent']
  const techStack: string[] = []
  const businessDomains: string[] = []
  let role = 'specialist'
  let icon = '🧠'

  const addCategory = (value: string) => {
    if (!categories.includes(value)) categories.push(value)
  }
  const addTech = (value: string) => {
    if (!techStack.includes(value)) techStack.push(value)
  }
  const addDomain = (value: string) => {
    if (!businessDomains.includes(value)) businessDomains.push(value)
  }

  if (/(front|react|vue|css|ui)/i.test(haystack)) {
    addCategory('frontend')
    addTech(/vue/i.test(haystack) ? 'vue' : /react/i.test(haystack) ? 'react' : 'javascript')
    role = 'frontend-engineer'
    icon = '🎨'
  }
  if (/(backend|api|server|sql|database)/i.test(haystack)) {
    addCategory('backend')
    role = role === 'frontend-engineer' ? 'fullstack-engineer' : 'backend-engineer'
    addDomain('api')
    icon = '⚙️'
  }
  if (/(test|qa|playwright|vitest|jest|e2e)/i.test(haystack)) {
    addCategory('testing')
    role = 'test-engineer'
    icon = '🧪'
  }
  if (/(security|privacy|compliance|contract|legal)/i.test(haystack)) {
    addCategory(/legal|contract/i.test(haystack) ? 'legal' : 'security')
    addDomain(/legal|contract/i.test(haystack) ? 'contracts' : 'compliance')
    role = /legal|contract/i.test(haystack) ? 'legal' : 'security-engineer'
    icon = /legal|contract/i.test(haystack) ? '⚖️' : '🔒'
  }
  if (/(finance|financial|budget|forecast|fp&a)/i.test(haystack)) {
    addCategory('finance')
    addDomain('fp-and-a')
    role = 'finance-analyst'
    icon = '💹'
  }
  if (/(accounting|payroll|invoice|ledger|tax)/i.test(haystack)) {
    addCategory('accounting')
    addDomain('payroll')
    role = 'accountant'
    icon = '🧾'
  }
  if (/(recruit|talent|hiring|candidate|human resources|people ops)/i.test(haystack)) {
    addCategory('hr')
    addDomain('recruiting')
    role = 'hr-specialist'
    icon = '🧑‍💼'
  }
  if (/(support|ticket|customer success|helpdesk)/i.test(haystack)) {
    addCategory('operations')
    addDomain('customer-support')
    role = 'operations'
    icon = '🎧'
  }
  if (/(sales|crm|pipeline|lead)/i.test(haystack)) {
    addCategory('operations')
    addDomain('crm')
    role = 'operations'
    icon = '🤝'
  }
  if (/(python|fastapi|pytest)/i.test(haystack)) addTech('python')
  if (/(javascript|typescript|node|bun)/i.test(haystack)) addTech('javascript')
  if (/(go|golang)/i.test(haystack)) addTech('go')
  if (/(java|spring|kotlin)/i.test(haystack)) addTech('java')
  if (/(rust|cargo)/i.test(haystack)) addTech('rust')
  if (/(workflow|orchestr|agent)/i.test(haystack)) tags.add('workflow')

  return {
    categories,
    techStack,
    businessDomains,
    role,
    tags: [...tags],
    icon,
  }
}

function toEntry(record: ClawHubSkillRecord): CommunityMarketplaceEntry {
  const mapped = categorizeSkill(record)
  const slug = record.skill.slug
  const owner = record.owner?.handle || record.ownerHandle || record.owner?.displayName || 'community'
  const displayName = record.skill.displayName || slug
  const tags = new Set(mapped.tags)
  if (record.skill.badges?.official) tags.add('official')
  if (record.skill.badges?.highlighted) tags.add('highlighted')
  if (record.skill.badges?.deprecated) tags.add('deprecated')

  return {
    id: `${slug}@${CLAWHUB_MARKETPLACE_NAME}`,
    name: displayName,
    icon: mapped.icon,
    description: record.skill.summary || 'ClawHub community skill',
    categories: mapped.categories,
    techStack: mapped.techStack,
    businessDomains: mapped.businessDomains,
    role: mapped.role,
    tags: [...tags],
    version: record.latestVersion?.version || 'latest',
    author: owner,
    downloads: record.skill.stats?.downloads || 0,
    rating: 4.2,
    installed: false,
    enabled: false,
    hot: !!record.skill.badges?.highlighted,
    new: false,
    marketplace: CLAWHUB_MARKETPLACE_NAME,
    installable: false,
    externalUrl: `${CLAWHUB_SITE_URL}/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`,
    sourceType: 'community',
  }
}

function mergeDetail(base: CommunityMarketplaceEntry, detail: ClawHubSkillDetail): CommunityMarketplaceEntry {
  const tags = new Set(base.tags)
  if (detail.skill?.badges?.official) tags.add('official')
  if (detail.skill?.badges?.highlighted) tags.add('highlighted')
  if (detail.skill?.badges?.deprecated) tags.add('deprecated')
  if (detail.latestVersion?.parsed && typeof detail.latestVersion.parsed === 'object') {
    for (const [key, value] of Object.entries(detail.latestVersion.parsed)) {
      if (typeof value === 'string' && value.trim()) {
        tags.add(`${key}:${value}`)
      }
    }
  }
  if (detail.latestVersion?.staticScan?.status) {
    tags.add(`scan:${detail.latestVersion.staticScan.status}`)
  }

  return {
    ...base,
    name: detail.skill?.displayName || base.name,
    author: detail.owner?.handle || detail.owner?.displayName || detail.owner?.name || base.author,
    description: detail.latestVersion?.llmAnalysis?.summary || detail.skill?.summary || base.description,
    version: detail.latestVersion?.version || base.version,
    tags: [...tags],
    hot: !!detail.skill?.badges?.highlighted || base.hot,
  }
}

export async function listClawHubMarketplaceEntries(): Promise<CommunityMarketplaceEntry[]> {
  if (cache && cache.expiresAt > Date.now()) {
    logClawHubCache(`hit list ttl_ms=${cache.expiresAt - Date.now()} items=${cache.entries.length} hydrated=${cache.hydrated}`)
    if (!cache.hydrated) {
      void ensureBackgroundHydration()
    }
    return cache.entries
  }

  if (cache) {
    logClawHubCache('expired list')
  } else {
    logClawHubCache('miss list')
  }

  const firstPage = await clawHubQuery<ClawHubListResponse>('skills:listPublicPageV4', {
    cursor: undefined,
    numItems: CLAWHUB_INITIAL_ITEMS,
    sort: 'downloads',
    dir: 'desc',
    highlightedOnly: false,
    nonSuspiciousOnly: true,
  })

  const entries = firstPage.page.map(toEntry)

  cache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    entries,
    hydrated: !firstPage.hasMore || !firstPage.nextCursor || entries.length >= CLAWHUB_MAX_ITEMS,
    nextCursor: firstPage.nextCursor,
  }
  logClawHubCache(`store list ttl_ms=${CACHE_TTL_MS} items=${entries.length} hydrated=${cache.hydrated}`)

  if (!cache.hydrated) {
    void ensureBackgroundHydration()
  }

  return entries
}

export function isClawHubPluginId(pluginId: string): boolean {
  return pluginId.endsWith(`@${CLAWHUB_MARKETPLACE_NAME}`)
}

export async function getClawHubMarketplaceEntry(pluginId: string): Promise<CommunityMarketplaceEntry | null> {
  if (!isClawHubPluginId(pluginId)) {
    return null
  }

  const cachedDetail = detailCache.get(pluginId)
  if (cachedDetail && cachedDetail.expiresAt > Date.now()) {
    logClawHubCache(`hit detail plugin=${pluginId} ttl_ms=${cachedDetail.expiresAt - Date.now()}`)
    return cachedDetail.entry
  }

  if (cachedDetail) {
    logClawHubCache(`expired detail plugin=${pluginId}`)
  } else {
    logClawHubCache(`miss detail plugin=${pluginId}`)
  }

  const baseEntries = await listClawHubMarketplaceEntries()
  const base = baseEntries.find(entry => entry.id === pluginId)
  if (!base) {
    if (cache && !cache.hydrated) {
      await ensureBackgroundHydration()
      const hydratedBase = cache?.entries.find(entry => entry.id === pluginId)
      if (!hydratedBase) {
        return null
      }
      return getClawHubMarketplaceEntryFromBase(pluginId, hydratedBase)
    }
    return null
  }

  return getClawHubMarketplaceEntryFromBase(pluginId, base)
}

async function getClawHubMarketplaceEntryFromBase(
  pluginId: string,
  base: CommunityMarketplaceEntry,
): Promise<CommunityMarketplaceEntry | null> {

  const slug = pluginId.replace(`@${CLAWHUB_MARKETPLACE_NAME}`, '')
  try {
    const detail = await clawHubQuery<ClawHubSkillDetail>('skills:getBySlug', { slug })
    const merged = mergeDetail(base, detail)
    detailCache.set(pluginId, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      entry: merged,
    })
    logClawHubCache(`store detail plugin=${pluginId} ttl_ms=${CACHE_TTL_MS}`)
    return merged
  } catch {
    logClawHubCache(`fallback base plugin=${pluginId}`)
    return base
  }
}

export function clearClawHubCache(): void {
  cache = undefined
  detailCache.clear()
  backgroundHydrationPromise = null
  logClawHubCache('clear all')
}

export function isClawHubCacheHydrated(): boolean {
  return !!cache?.hydrated
}

export function onClawHubCacheHydrated(listener: () => void): () => void {
  hydrationListeners.add(listener)
  return () => {
    hydrationListeners.delete(listener)
  }
}

async function ensureBackgroundHydration(): Promise<void> {
  if (backgroundHydrationPromise) {
    return backgroundHydrationPromise
  }

  backgroundHydrationPromise = hydrateClawHubCache()
    .catch(error => {
      logClawHubCache(`background hydrate failed error=${error instanceof Error ? error.message : String(error)}`)
    })
    .finally(() => {
      backgroundHydrationPromise = null
    })

  return backgroundHydrationPromise
}

async function hydrateClawHubCache(): Promise<void> {
  if (!cache || cache.hydrated) {
    return
  }

  logClawHubCache(`background hydrate start items=${cache.entries.length}`)
  let cursor = cache.nextCursor ?? undefined
  const entries = [...cache.entries]

  while (entries.length < CLAWHUB_MAX_ITEMS && cursor) {
    const page = await clawHubQuery<ClawHubListResponse>('skills:listPublicPageV4', {
      cursor,
      numItems: Math.min(CLAWHUB_PAGE_SIZE, CLAWHUB_MAX_ITEMS - entries.length),
      sort: 'downloads',
      dir: 'desc',
      highlightedOnly: false,
      nonSuspiciousOnly: true,
    })

    entries.push(...page.page.map(toEntry))
    cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined

    cache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      entries,
      hydrated: !cursor || entries.length >= CLAWHUB_MAX_ITEMS,
      nextCursor: cursor,
    }
    logClawHubCache(`background hydrate batch items=${entries.length} hydrated=${cache.hydrated}`)

    if (cache.hydrated) {
      for (const listener of hydrationListeners) {
        try {
          listener()
        } catch (error) {
          logClawHubCache(`hydration listener failed error=${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }
}
