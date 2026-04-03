/**
 * Unattended Mode Manager
 *
 * Main entry point for unattended mode functionality.
 * Coordinates configuration, state, boundaries, and execution control.
 */

import {
  type UnattendedModeConfig,
  type UnattendedModeState,
  type UnattendedModeStatus,
  type UnattendedPermissionCheck,
  type AuditLogEntry,
  createDefaultUnattendedModeConfig,
} from '../../types/unattended.js'
import {
  loadConfigFromFile,
  mergeConfigWithCLIArgs,
  validateConfigSafety,
  type UnattendedCLIArgs,
} from './config.js'
import {
  UnattendedModeStateManager,
  getUnattendedModeStateManager,
  resetStateManager,
} from './state.js'
import {
  BoundaryChecker,
  createBoundaryChecker,
} from './boundaries.js'
import {
  CircuitBreaker,
  getCircuitBreaker,
  createCircuitBreaker,
  type CircuitBreakerConfig,
} from './circuitBreaker.js'
import {
  ExecutionController,
  getExecutionController,
  createExecutionController,
} from './executor.js'
import {
  AuditLogger,
  getAuditLogger,
  createAuditLogger,
} from './logger.js'
import {
  CheckpointManager,
  createCheckpointManager,
} from './checkpoint.js'
import {
  NotificationManager,
  initializeNotificationManager,
  createWebhookPayload,
} from './notifications.js'

// ============================================================================
// UnattendedModeManager
// ============================================================================

/**
 * Main manager for unattended mode execution.
 *
 * Coordinates all components:
 * - Configuration loading and validation
 * - State management
 * - Security boundary checking
 * - Execution control and limits
 * - Audit logging
 * - Checkpoint save/restore
 * - Notifications
 */
export class UnattendedModeManager {
  private config: UnattendedModeConfig
  private readonly stateManager: UnattendedModeStateManager
  private readonly boundaryChecker: BoundaryChecker
  private readonly circuitBreaker: CircuitBreaker
  private readonly executor: ExecutionController
  private readonly logger: AuditLogger
  private readonly checkpointManager: CheckpointManager
  private notificationManager: NotificationManager | null = null

  private initialized: boolean = false

  constructor(config: UnattendedModeConfig) {
    this.config = config
    this.stateManager = getUnattendedModeStateManager()
    this.boundaryChecker = createBoundaryChecker(config.boundaries)
    this.circuitBreaker = getCircuitBreaker()
    this.executor = createExecutionController(config.execution)
    this.logger = getAuditLogger()
    this.checkpointManager = createCheckpointManager(
      config.failureHandling.checkpoint.enabled,
      config.failureHandling.checkpoint.interval,
      config.failureHandling.checkpoint.path,
    )
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  /**
   * Initializes the unattended mode manager.
   */
  async initialize(metadata?: {
    sessionId?: string
    workingDirectory?: string
    prompt?: string
  }): Promise<void> {
    if (this.initialized) return

    // Validate configuration safety
    const safetyError = validateConfigSafety(this.config)
    if (safetyError) {
      throw new Error(safetyError)
    }

    // Initialize notification manager
    this.notificationManager = initializeNotificationManager(this.config.notifications)

    // Check for existing checkpoint
    const checkpoint = this.checkpointManager.load()
    if (checkpoint && this.checkpointManager.validateConfig(checkpoint, this.config)) {
      this.checkpointManager.restore(checkpoint)
      this.logger.logStatusChange('initializing', this.stateManager.getStatus(), 'Restored from checkpoint')
    }

    // Start checkpoint auto-save
    this.checkpointManager.startAutoCheckpoint(this.config, {
      sessionId: metadata?.sessionId,
      workingDirectory: metadata?.workingDirectory ?? process.cwd(),
      prompt: metadata?.prompt,
    })

    // Start status reporting
    if (this.notificationManager) {
      this.notificationManager.startStatusReporting(() =>
        createWebhookPayload(this.stateManager.getState()),
      )
    }

    this.stateManager.setStatus('running')
    this.initialized = true

    this.logger.log({
      type: 'status_change',
      action: 'Initialized unattended mode',
      allowed: true,
    })
  }

  /**
   * Shuts down the unattended mode manager.
   */
  async shutdown(status: UnattendedModeStatus = 'completed'): Promise<void> {
    if (!this.initialized) return

    // Stop auto-checkpoint
    this.checkpointManager.stopAutoCheckpoint()

    // Stop status reporting
    if (this.notificationManager) {
      this.notificationManager.stopStatusReporting()
    }

    // Save final checkpoint
    this.checkpointManager.save(this.config)

    // Send completion notification
    if (this.notificationManager && status === 'completed') {
      await this.notificationManager.sendCompletionNotification(
        createWebhookPayload(this.stateManager.getState()),
      )
    }

    this.stateManager.setStatus(status)
    this.initialized = false

    this.logger.logStatusChange('running', status)
  }

  // =========================================================================
  // Permission Checking
  // =========================================================================

  /**
   * Checks if a tool can be auto-executed.
   * This is the main entry point for permission checking.
   */
  async canAutoExecute(
    toolName: string,
    input: unknown,
  ): Promise<UnattendedPermissionCheck> {
    // 1. Check if initialized
    if (!this.initialized) {
      return { allowed: false, reason: 'Unattended mode not initialized' }
    }

    // 2. Check circuit breaker
    if (this.circuitBreaker.isOpen()) {
      const status = this.circuitBreaker.getStatus()
      return {
        allowed: false,
        reason: status.reason ?? 'Circuit breaker open',
      }
    }

    // 3. Check execution limits
    const limitsCheck = this.executor.checkLimits()
    if (!limitsCheck.allowed) {
      return { allowed: false, reason: limitsCheck.reason }
    }

    // 4. Check denied tools
    if (this.boundaryChecker.isDenied(toolName)) {
      this.logger.logPermissionCheck(toolName, 'denied_list', false, 'Tool in denied list')
      return { allowed: false, reason: 'Tool in denied list' }
    }

    // 5. Check allowed tools
    if (!this.boundaryChecker.isAllowed(toolName)) {
      this.logger.logPermissionCheck(toolName, 'allowed_list', false, 'Tool not in allowed list')
      return { allowed: false, reason: 'Tool not in allowed list' }
    }

    // 6. Tool-specific checks
    if (toolName === 'Bash') {
      const bashInput = input as { command?: string }
      if (bashInput.command) {
        const bashCheck = this.boundaryChecker.isBashCommandAllowed(bashInput.command)
        if (!bashCheck.allowed) {
          this.logger.logPermissionCheck(toolName, 'bash_pattern', false, bashCheck.reason)
          return bashCheck
        }
      }
    }

    if (toolName === 'Write' || toolName === 'Edit') {
      const fileInput = input as { file_path?: string }
      if (fileInput.file_path) {
        const pathCheck = this.boundaryChecker.isWriteAllowed(fileInput.file_path)
        if (!pathCheck.allowed) {
          this.logger.logPermissionCheck(toolName, 'path_check', false, pathCheck.reason)
          return pathCheck
        }
      }
    }

    if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep') {
      const pathInput = input as { path?: string; file_path?: string }
      const path = pathInput.path ?? pathInput.file_path
      if (path) {
        const pathCheck = this.boundaryChecker.isPathAllowed(path)
        if (!pathCheck.allowed) {
          this.logger.logPermissionCheck(toolName, 'path_check', false, pathCheck.reason)
          return pathCheck
        }
      }
    }

    // 7. All checks passed
    this.logger.logPermissionCheck(toolName, 'all_checks', true)
    return { allowed: true }
  }

  // =========================================================================
  // Execution Tracking
  // =========================================================================

  /**
   * Records a tool call start.
   */
  recordToolCallStart(toolName: string): void {
    this.stateManager.incrementToolCallCount()
    this.logger.logToolCall(toolName, 'started', true)
  }

  /**
   * Records a tool call success.
   */
  recordToolCallSuccess(toolName: string): void {
    this.stateManager.recordSuccess()
    this.circuitBreaker.recordSuccess()
    this.logger.logToolCall(toolName, 'completed', true)
  }

  /**
   * Records a tool call failure.
   */
  recordToolCallFailure(toolName: string, error: Error): void {
    this.stateManager.recordFailure()
    this.stateManager.recordError({
      toolName,
      message: error.message,
      code: (error as NodeJS.ErrnoException).code,
      stack: error.stack,
      retried: false,
    })
    this.circuitBreaker.recordFailure(error.message)
    this.logger.logToolCall(toolName, 'failed', false, error.message)

    // Handle failure behavior
    this.handleFailure(error)
  }

  /**
   * Records a file modification.
   */
  recordFileModification(filePath: string): void {
    this.stateManager.incrementFileModificationCount()
    this.logger.log({
      type: 'tool_call',
      toolName: 'Write/Edit',
      action: `Modified: ${filePath}`,
      allowed: true,
    })
  }

  // =========================================================================
  // Failure Handling
  // =========================================================================

  /**
   * Handles a failure according to configured behavior.
   */
  private handleFailure(error: Error): void {
    switch (this.config.failureHandling.behavior) {
      case 'stop':
        this.shutdown('failed')
        break

      case 'continue':
        // Continue execution, just log
        break

      case 'ask':
        // In unattended mode, 'ask' defaults to stop
        // Would need external callback for true ask behavior
        this.shutdown('failed')
        break
    }
  }

  // =========================================================================
  // State Access
  // =========================================================================

  /**
   * Gets the current state.
   */
  getState(): Readonly<UnattendedModeState> {
    return this.stateManager.getState()
  }

  /**
   * Gets the current status.
   */
  getStatus(): UnattendedModeStatus {
    return this.stateManager.getStatus()
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): Readonly<UnattendedModeConfig> {
    return this.config
  }

  /**
   * Gets execution statistics.
   */
  getStats() {
    return this.executor.getStats()
  }

  /**
   * Checks if execution is healthy.
   */
  isHealthy(): boolean {
    return !this.circuitBreaker.isOpen() && this.getStatus() === 'running'
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

let managerInstance: UnattendedModeManager | null = null

/**
 * Gets the singleton unattended mode manager instance.
 */
export function getUnattendedModeManager(): UnattendedModeManager | null {
  return managerInstance
}

/**
 * Initializes the singleton unattended mode manager.
 */
export function initializeUnattendedMode(
  config: UnattendedModeConfig,
  metadata?: {
    sessionId?: string
    workingDirectory?: string
    prompt?: string
  },
): UnattendedModeManager {
  if (managerInstance) {
    return managerInstance
  }

  managerInstance = new UnattendedModeManager(config)
  // Note: initialize() is async but we're not awaiting here
  // The caller should call initialize() separately if needed
  return managerInstance
}

/**
 * Creates a new unattended mode manager without singleton.
 */
export function createUnattendedModeManager(config: UnattendedModeConfig): UnattendedModeManager {
  return new UnattendedModeManager(config)
}

/**
 * Resets the singleton instance (for testing).
 */
export function resetUnattendedModeManager(): void {
  if (managerInstance) {
    managerInstance.shutdown('stopped').catch(() => {})
  }
  managerInstance = null
  resetStateManager()
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  loadConfigFromFile,
  mergeConfigWithCLIArgs,
  validateConfigSafety,
  type UnattendedCLIArgs,
}

export { createDefaultUnattendedModeConfig }
export type { UnattendedModeConfig, UnattendedModeState, UnattendedModeStatus, UnattendedPermissionCheck, AuditLogEntry }
