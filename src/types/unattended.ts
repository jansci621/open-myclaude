/**
 * Type definitions for unattended mode.
 *
 * Unattended mode enables Claude Code to execute tasks autonomously without
 * human intervention, with well-defined security boundaries, failure handling,
 * and observability.
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Security boundaries for unattended mode execution.
 */
export interface UnattendedModeBoundaries {
  /** Whitelist: tools allowed to auto-execute */
  allowedTools: string[]

  /** Blacklist: tools denied from auto-execution */
  deniedTools: string[]

  /** Allowed Bash command patterns (glob patterns) */
  allowedBashPatterns: string[]

  /** Directory boundaries for file operations */
  allowedDirectories: string[]

  /** Protected paths that cannot be modified */
  protectedPaths: string[]

  /** Network access control level */
  networkAccess: 'none' | 'whitelist' | 'all'

  /** Allowed hosts for network access (when networkAccess is 'whitelist') */
  allowedHosts: string[]
}

/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxRetries: number

  /** Backoff delay in milliseconds between retries */
  backoffMs: number

  /** Error codes/types that are retryable */
  retryableErrors: string[]
}

/**
 * Execution control settings.
 */
export interface ExecutionControl {
  /** Maximum execution duration in milliseconds */
  maxDuration: number

  /** Maximum number of tool calls allowed */
  maxToolCalls: number

  /** Maximum number of file modifications allowed */
  maxFileModifications: number

  /** Single command timeout in milliseconds */
  commandTimeout: number

  /** Retry policy for failed operations */
  retryPolicy: RetryPolicy
}

/**
 * Notification configuration for completion events.
 */
export interface CompletionNotification {
  /** Whether completion notifications are enabled */
  enabled: boolean

  /** Webhook URL to notify on completion */
  webhook?: string

  /** Email address to notify on completion */
  email?: string
}

/**
 * Notification configuration for error events.
 */
export interface ErrorNotification {
  /** Whether error notifications are enabled */
  enabled: boolean

  /** Whether to send immediate notifications on error */
  immediate: boolean

  /** Webhook URL to notify on error */
  webhook?: string
}

/**
 * Status report notification configuration.
 */
export interface StatusReportNotification {
  /** Whether status reports are enabled */
  enabled: boolean

  /** Interval between status reports in milliseconds */
  interval: number

  /** Webhook URL for status reports */
  webhook?: string
}

/**
 * Overall notification configuration.
 */
export interface NotificationConfig {
  /** Notification settings for task completion */
  onComplete: CompletionNotification

  /** Notification settings for errors */
  onError: ErrorNotification

  /** Notification settings for periodic status reports */
  statusReport: StatusReportNotification
}

/**
 * Checkpoint configuration for recovery.
 */
export interface CheckpointConfig {
  /** Whether checkpointing is enabled */
  enabled: boolean

  /** Interval between checkpoints in milliseconds */
  interval: number

  /** Path to store checkpoint files */
  path: string
}

/**
 * Failure handling configuration.
 */
export interface FailureHandling {
  /** Behavior on error: stop, continue, or ask (escalate) */
  behavior: 'stop' | 'continue' | 'ask'

  /** External decision callback URL for complex failure scenarios */
  decisionCallback?: string

  /** Checkpoint configuration for recovery */
  checkpoint: CheckpointConfig
}

/**
 * File change trigger configuration.
 */
export interface FileWatchTrigger {
  /** Paths to watch for changes */
  paths: string[]

  /** Events to trigger on */
  events: ('create' | 'modify' | 'delete')[]
}

/**
 * Webhook trigger configuration.
 */
export interface WebhookTrigger {
  /** Port to listen on */
  port: number

  /** URL path for the webhook endpoint */
  path: string

  /** Secret for webhook verification */
  secret: string
}

/**
 * Trigger configuration for automated execution.
 */
export interface TriggerConfig {
  /** Scheduled execution (cron expression) */
  schedule?: string

  /** File change trigger */
  fileWatch?: FileWatchTrigger

  /** Webhook trigger */
  webhook?: WebhookTrigger
}

/**
 * Complete configuration for unattended mode.
 */
export interface UnattendedModeConfig {
  /** Enable unattended mode */
  enabled: boolean

  /** Security boundaries */
  boundaries: UnattendedModeBoundaries

  /** Execution control settings */
  execution: ExecutionControl

  /** Triggers for automated execution (optional) */
  triggers?: TriggerConfig

  /** Notification configuration */
  notifications: NotificationConfig

  /** Failure handling configuration */
  failureHandling: FailureHandling
}

// ============================================================================
// State Types
// ============================================================================

/**
 * Status of unattended mode execution.
 */
export type UnattendedModeStatus =
  | 'initializing'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'stopped'

/**
 * Represents an error that occurred during unattended execution.
 */
export interface UnattendedError {
  /** Timestamp when the error occurred */
  timestamp: number

  /** Tool name that caused the error */
  toolName: string

  /** Error message */
  message: string

  /** Error type/code */
  code?: string

  /** Whether this error was retried */
  retried: boolean

  /** Number of retry attempts made */
  retryCount?: number

  /** Stack trace if available */
  stack?: string
}

/**
 * Statistics for unattended mode execution.
 */
export interface ExecutionStats {
  /** Total number of tool calls made */
  toolCallCount: number

  /** Number of successful tool calls */
  successCount: number

  /** Number of failed tool calls */
  failureCount: number

  /** Number of file modifications made */
  fileModificationCount: number

  /** Total bytes read */
  bytesRead: number

  /** Total bytes written */
  bytesWritten: number
}

/**
 * State of unattended mode execution.
 */
export interface UnattendedModeState {
  /** Current status */
  status: UnattendedModeStatus

  /** Timestamp when execution started */
  startTime: number

  /** Timestamp when execution ended (if completed/failed/stopped) */
  endTime?: number

  /** Execution statistics */
  stats: ExecutionStats

  /** Errors that occurred during execution */
  errors: UnattendedError[]

  /** Last checkpoint timestamp */
  lastCheckpointTime?: number

  /** Last checkpoint data (for recovery) */
  lastCheckpointData?: unknown
}

// ============================================================================
// Audit Log Types
// ============================================================================

/**
 * Audit log entry for unattended mode.
 */
export interface AuditLogEntry {
  /** Timestamp of the entry */
  timestamp: number

  /** Type of audit event */
  type: 'tool_call' | 'permission_check' | 'boundary_check' | 'error' | 'checkpoint' | 'notification' | 'status_change'

  /** Tool name (for tool_call and permission_check types) */
  toolName?: string

  /** Action taken */
  action: string

  /** Whether the action was allowed/successful */
  allowed?: boolean

  /** Reason for the decision */
  reason?: string

  /** Additional metadata */
  metadata?: Record<string, unknown>
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a permission check for unattended mode.
 */
export interface UnattendedPermissionCheck {
  /** Whether the tool execution is allowed */
  allowed: boolean

  /** Reason if not allowed */
  reason?: string

  /** Whether this was a boundary check */
  fromBoundaryCheck?: boolean
}

/**
 * Result of circuit breaker check.
 */
export interface CircuitBreakerStatus {
  /** Whether the circuit is open (blocking execution) */
  isOpen: boolean

  /** Number of consecutive failures */
  failureCount: number

  /** Time when the circuit was opened */
  openedAt?: number

  /** Reason the circuit was opened */
  reason?: string
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default protected paths that cannot be modified in unattended mode.
 */
export const DEFAULT_PROTECTED_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '~/.ssh',
  '~/.gnupg',
  '.git',
  '.git/config',
  '.env',
  '.claude/settings.json',
  '.claude/managed-settings.json',
]

/**
 * Default retry policy.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  backoffMs: 1000,
  retryableErrors: ['ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED'],
}

/**
 * Default execution control settings.
 */
export const DEFAULT_EXECUTION_CONTROL: ExecutionControl = {
  maxDuration: 3600000, // 1 hour
  maxToolCalls: 1000,
  maxFileModifications: 100,
  commandTimeout: 60000, // 1 minute
  retryPolicy: DEFAULT_RETRY_POLICY,
}

/**
 * Default notification configuration.
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  onComplete: { enabled: false },
  onError: { enabled: true, immediate: true },
  statusReport: { enabled: false, interval: 300000 }, // 5 minutes
}

/**
 * Default failure handling configuration.
 */
export const DEFAULT_FAILURE_HANDLING: FailureHandling = {
  behavior: 'stop',
  checkpoint: {
    enabled: true,
    interval: 60000, // 1 minute
    path: '~/.claude/unattended-checkpoint.json',
  },
}

/**
 * Default boundaries configuration.
 */
export const DEFAULT_BOUNDARIES: UnattendedModeBoundaries = {
  allowedTools: [],
  deniedTools: [],
  allowedBashPatterns: [],
  allowedDirectories: [],
  protectedPaths: DEFAULT_PROTECTED_PATHS,
  networkAccess: 'none',
  allowedHosts: [],
}

/**
 * Creates a default unattended mode configuration.
 */
export function createDefaultUnattendedModeConfig(): UnattendedModeConfig {
  return {
    enabled: false,
    boundaries: { ...DEFAULT_BOUNDARIES, protectedPaths: [...DEFAULT_PROTECTED_PATHS] },
    execution: { ...DEFAULT_EXECUTION_CONTROL, retryPolicy: { ...DEFAULT_RETRY_POLICY } },
    notifications: {
      onComplete: { ...DEFAULT_NOTIFICATION_CONFIG.onComplete },
      onError: { ...DEFAULT_NOTIFICATION_CONFIG.onError },
      statusReport: { ...DEFAULT_NOTIFICATION_CONFIG.statusReport },
    },
    failureHandling: {
      ...DEFAULT_FAILURE_HANDLING,
      checkpoint: { ...DEFAULT_FAILURE_HANDLING.checkpoint },
    },
  }
}

/**
 * Creates an initial unattended mode state.
 */
export function createInitialUnattendedModeState(): UnattendedModeState {
  return {
    status: 'initializing',
    startTime: Date.now(),
    stats: {
      toolCallCount: 0,
      successCount: 0,
      failureCount: 0,
      fileModificationCount: 0,
      bytesRead: 0,
      bytesWritten: 0,
    },
    errors: [],
  }
}
