/**
 * Configuration loading and validation for unattended mode.
 *
 * Provides Zod schemas for runtime validation and functions to load
 * configuration from files or CLI arguments.
 */

import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { resolve, expandTildePath } from 'path'
import { z } from 'zod/v4'
import {
  type UnattendedModeConfig,
  type UnattendedModeBoundaries,
  type ExecutionControl,
  type NotificationConfig,
  type FailureHandling,
  type RetryPolicy,
  DEFAULT_PROTECTED_PATHS,
  DEFAULT_RETRY_POLICY,
  DEFAULT_EXECUTION_CONTROL,
  DEFAULT_NOTIFICATION_CONFIG,
  DEFAULT_FAILURE_HANDLING,
  DEFAULT_BOUNDARIES,
  createDefaultUnattendedModeConfig,
} from '../../types/unattended.js'

// ============================================================================
// Zod Schemas
// ============================================================================

export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().nonnegative().default(3),
  backoffMs: z.number().int().nonnegative().default(1000),
  retryableErrors: z.array(z.string()).default(['ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED']),
})

export const BoundariesSchema = z.object({
  allowedTools: z.array(z.string()).default([]),
  deniedTools: z.array(z.string()).default([]),
  allowedBashPatterns: z.array(z.string()).default([]),
  allowedDirectories: z.array(z.string()).default([]),
  protectedPaths: z.array(z.string()).default(DEFAULT_PROTECTED_PATHS),
  networkAccess: z.enum(['none', 'whitelist', 'all']).default('none'),
  allowedHosts: z.array(z.string()).default([]),
})

export const ExecutionControlSchema = z.object({
  maxDuration: z.number().int().positive().default(3600000), // 1 hour
  maxToolCalls: z.number().int().positive().default(1000),
  maxFileModifications: z.number().int().nonnegative().default(100),
  commandTimeout: z.number().int().positive().default(60000), // 1 minute
  retryPolicy: RetryPolicySchema.default(DEFAULT_RETRY_POLICY),
})

export const CompletionNotificationSchema = z.object({
  enabled: z.boolean().default(false),
  webhook: z.string().url().optional(),
  email: z.string().email().optional(),
})

export const ErrorNotificationSchema = z.object({
  enabled: z.boolean().default(true),
  immediate: z.boolean().default(true),
  webhook: z.string().url().optional(),
})

export const StatusReportNotificationSchema = z.object({
  enabled: z.boolean().default(false),
  interval: z.number().int().positive().default(300000), // 5 minutes
  webhook: z.string().url().optional(),
})

export const NotificationConfigSchema = z.object({
  onComplete: CompletionNotificationSchema.default({ enabled: false }),
  onError: ErrorNotificationSchema.default({ enabled: true, immediate: true }),
  statusReport: StatusReportNotificationSchema.default({ enabled: false, interval: 300000 }),
})

export const CheckpointConfigSchema = z.object({
  enabled: z.boolean().default(true),
  interval: z.number().int().positive().default(60000), // 1 minute
  path: z.string().default('~/.claude/unattended-checkpoint.json'),
})

export const FailureHandlingSchema = z.object({
  behavior: z.enum(['stop', 'continue', 'ask']).default('stop'),
  decisionCallback: z.string().url().optional(),
  checkpoint: CheckpointConfigSchema.default({ enabled: true, interval: 60000, path: '~/.claude/unattended-checkpoint.json' }),
})

export const FileWatchTriggerSchema = z.object({
  paths: z.array(z.string()),
  events: z.array(z.enum(['create', 'modify', 'delete'])),
})

export const WebhookTriggerSchema = z.object({
  port: z.number().int().positive(),
  path: z.string(),
  secret: z.string(),
})

export const TriggerConfigSchema = z.object({
  schedule: z.string().optional(), // cron expression
  fileWatch: FileWatchTriggerSchema.optional(),
  webhook: WebhookTriggerSchema.optional(),
})

export const UnattendedModeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  boundaries: BoundariesSchema.default({}),
  execution: ExecutionControlSchema.default({}),
  triggers: TriggerConfigSchema.optional(),
  notifications: NotificationConfigSchema.default({}),
  failureHandling: FailureHandlingSchema.default({}),
})

// ============================================================================
// Config Loading Functions
// ============================================================================

/**
 * Expands tilde paths in configuration.
 */
function expandConfigPaths(config: Record<string, unknown>): void {
  if (!config || typeof config !== 'object') return

  // Expand paths in boundaries
  const boundaries = config.boundaries as Record<string, unknown> | undefined
  if (boundaries) {
    if (Array.isArray(boundaries.allowedDirectories)) {
      boundaries.allowedDirectories = boundaries.allowedDirectories.map((p: string) =>
        p.startsWith('~') ? resolve(homedir(), p.slice(1)) : p,
      )
    }
    if (Array.isArray(boundaries.protectedPaths)) {
      boundaries.protectedPaths = boundaries.protectedPaths.map((p: string) =>
        p.startsWith('~') ? resolve(homedir(), p.slice(1)) : p,
      )
    }
  }

  // Expand checkpoint path
  const failureHandling = config.failureHandling as Record<string, unknown> | undefined
  if (failureHandling?.checkpoint) {
    const checkpoint = failureHandling.checkpoint as Record<string, unknown>
    if (typeof checkpoint.path === 'string' && checkpoint.path.startsWith('~')) {
      checkpoint.path = resolve(homedir(), checkpoint.path.slice(1))
    }
  }
}

/**
 * Loads unattended mode configuration from a file.
 *
 * @param configPath - Path to the configuration file (JSON)
 * @returns Validated configuration object
 * @throws Error if file doesn't exist or validation fails
 */
export function loadConfigFromFile(configPath: string): UnattendedModeConfig {
  const expandedPath = configPath.startsWith('~')
    ? resolve(homedir(), configPath.slice(1))
    : resolve(configPath)

  if (!existsSync(expandedPath)) {
    throw new Error(`Unattended mode config file not found: ${expandedPath}`)
  }

  const content = readFileSync(expandedPath, 'utf-8')
  let parsed: unknown

  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new Error(`Failed to parse unattended mode config file: ${expandedPath}. Invalid JSON.`)
  }

  // Expand tilde paths before validation
  if (parsed && typeof parsed === 'object') {
    expandConfigPaths(parsed as Record<string, unknown>)
  }

  const result = UnattendedModeConfigSchema.safeParse(parsed)

  if (!result.success) {
    const errors = result.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid unattended mode config:\n${errors}`)
  }

  return result.data as UnattendedModeConfig
}

/**
 * CLI arguments that can override config file settings.
 */
export interface UnattendedCLIArgs {
  enabled?: boolean
  maxDuration?: number
  maxToolCalls?: number
  allowedTools?: string[]
  deniedTools?: string[]
  protectedPaths?: string[]
  allowedDirectories?: string[]
}

/**
 * Merges CLI arguments with file configuration.
 * CLI arguments take precedence over file configuration.
 */
export function mergeConfigWithCLIArgs(
  fileConfig: UnattendedModeConfig | null,
  cliArgs: UnattendedCLIArgs,
): UnattendedModeConfig {
  const baseConfig = fileConfig ?? createDefaultUnattendedModeConfig()

  return {
    ...baseConfig,
    enabled: cliArgs.enabled ?? baseConfig.enabled,
    boundaries: {
      ...baseConfig.boundaries,
      allowedTools: cliArgs.allowedTools ?? baseConfig.boundaries.allowedTools,
      deniedTools: cliArgs.deniedTools ?? baseConfig.boundaries.deniedTools,
      protectedPaths: cliArgs.protectedPaths ?? baseConfig.boundaries.protectedPaths,
      allowedDirectories: cliArgs.allowedDirectories ?? baseConfig.boundaries.allowedDirectories,
    },
    execution: {
      ...baseConfig.execution,
      maxDuration: cliArgs.maxDuration ?? baseConfig.execution.maxDuration,
      maxToolCalls: cliArgs.maxToolCalls ?? baseConfig.execution.maxToolCalls,
    },
  }
}

/**
 * Validates that the configuration is safe to use.
 * Returns an error message if validation fails, or null if valid.
 */
export function validateConfigSafety(config: UnattendedModeConfig): string | null {
  // Must have either allowedTools or allowedDirectories defined
  const hasAllowedTools = config.boundaries.allowedTools.length > 0
  const hasAllowedDirectories = config.boundaries.allowedDirectories.length > 0
  const hasDeniedTools = config.boundaries.deniedTools.length > 0

  if (!hasAllowedTools && !hasAllowedDirectories && !hasDeniedTools) {
    return 'Unattended mode requires at least one of: allowedTools, allowedDirectories, or deniedTools to be defined'
  }

  // Check for dangerous tool combinations
  const dangerousTools = ['Bash', 'Write', 'Edit']
  const allowedDangerousTools = config.boundaries.allowedTools.filter(t =>
    dangerousTools.some(d => t === d || t.startsWith(`${d}(`)),
  )

  if (allowedDangerousTools.length > 0 && !hasAllowedDirectories) {
    return `Unattended mode with dangerous tools (${allowedDangerousTools.join(', ')}) requires allowedDirectories to be defined`
  }

  return null
}

/**
 * Gets the default config file path.
 */
export function getDefaultConfigPath(): string {
  return resolve(homedir(), '.claude', 'unattended-config.json')
}

export type { UnattendedModeConfig, UnattendedModeBoundaries, ExecutionControl, NotificationConfig, FailureHandling, RetryPolicy }
