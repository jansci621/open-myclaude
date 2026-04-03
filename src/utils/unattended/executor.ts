/**
 * Execution control for unattended mode.
 *
 * Manages execution limits, timeouts, and retry logic.
 */

import {
  type ExecutionControl,
  type RetryPolicy,
  DEFAULT_EXECUTION_CONTROL,
} from '../../types/unattended.js'
import { UnattendedModeStateManager, getUnattendedModeStateManager } from './state.js'
import { CircuitBreaker, getCircuitBreaker } from './circuitBreaker.js'

// ============================================================================
// Execution Controller
// ============================================================================

/**
 * Result of checking execution limits.
 */
export interface LimitsCheckResult {
  /** Whether execution is allowed */
  allowed: boolean

  /** Reason if not allowed */
  reason?: string

  /** Which limit was hit, if any */
  limitHit?: 'duration' | 'toolCalls' | 'fileModifications' | 'circuitBreaker'
}

/**
 * Controls execution limits and provides retry logic.
 */
export class ExecutionController {
  private readonly config: ExecutionControl
  private readonly stateManager: UnattendedModeStateManager
  private readonly circuitBreaker: CircuitBreaker
  private startTime: number

  constructor(
    config: ExecutionControl = DEFAULT_EXECUTION_CONTROL,
    stateManager?: UnattendedModeStateManager,
    circuitBreaker?: CircuitBreaker,
  ) {
    this.config = config
    this.stateManager = stateManager ?? getUnattendedModeStateManager()
    this.circuitBreaker = circuitBreaker ?? getCircuitBreaker()
    this.startTime = Date.now()
  }

  /**
   * Checks all execution limits.
   */
  checkLimits(): LimitsCheckResult {
    // Check circuit breaker first
    if (this.circuitBreaker.isOpen()) {
      return {
        allowed: false,
        reason: 'Circuit breaker is open - too many recent failures',
        limitHit: 'circuitBreaker',
      }
    }

    // Check duration limit
    const elapsed = Date.now() - this.startTime
    if (elapsed >= this.config.maxDuration) {
      return {
        allowed: false,
        reason: `Maximum execution duration exceeded (${Math.round(elapsed / 1000)}s / ${Math.round(this.config.maxDuration / 1000)}s)`,
        limitHit: 'duration',
      }
    }

    // Check tool call limit
    const stats = this.stateManager.getStats()
    if (stats.toolCallCount >= this.config.maxToolCalls) {
      return {
        allowed: false,
        reason: `Maximum tool calls exceeded (${stats.toolCallCount} / ${this.config.maxToolCalls})`,
        limitHit: 'toolCalls',
      }
    }

    // Check file modification limit
    if (stats.fileModificationCount >= this.config.maxFileModifications) {
      return {
        allowed: false,
        reason: `Maximum file modifications exceeded (${stats.fileModificationCount} / ${this.config.maxFileModifications})`,
        limitHit: 'fileModifications',
      }
    }

    return { allowed: true }
  }

  /**
   * Checks if there's time remaining for execution.
   */
  getTimeRemaining(): number {
    const elapsed = Date.now() - this.startTime
    return Math.max(0, this.config.maxDuration - elapsed)
  }

  /**
   * Gets the configured command timeout.
   */
  getCommandTimeout(): number {
    return this.config.commandTimeout
  }

  /**
   * Records a successful tool execution.
   */
  recordSuccess(): void {
    this.stateManager.recordSuccess()
    this.circuitBreaker.recordSuccess()
  }

  /**
   * Records a failed tool execution.
   */
  recordFailure(error: Error): void {
    this.stateManager.recordFailure()
    this.stateManager.recordError({
      toolName: 'unknown', // Will be set by caller
      message: error.message,
      code: (error as NodeJS.ErrnoException).code,
      stack: error.stack,
      retried: false,
    })
    this.circuitBreaker.recordFailure(error.message)
  }

  /**
   * Executes a function with retry logic.
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    toolName: string,
  ): Promise<{ result?: T; error?: Error; retries: number }> {
    const policy = this.config.retryPolicy
    let lastError: Error | undefined
    let retries = 0

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        const result = await fn()
        this.recordSuccess()
        return { result, retries: attempt }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Check if error is retryable
        const errorCode = (lastError as NodeJS.ErrnoException).code
        const isRetryable = policy.retryableErrors.includes(errorCode ?? '') ||
          policy.retryableErrors.some(e => lastError.message.includes(e))

        if (!isRetryable || attempt >= policy.maxRetries) {
          this.recordFailure(lastError)
          return { error: lastError, retries: attempt }
        }

        // Wait before retry with exponential backoff
        retries = attempt + 1
        const delay = policy.backoffMs * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    // Should not reach here, but just in case
    if (lastError) {
      this.recordFailure(lastError)
    }
    return { error: lastError, retries }
  }

  /**
   * Wraps an async function with a timeout.
   */
  async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs?: number,
  ): Promise<T> {
    const timeout = timeoutMs ?? this.config.commandTimeout

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`))
      }, timeout)

      fn()
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /**
   * Resets the execution controller for a new session.
   */
  reset(): void {
    this.startTime = Date.now()
    this.stateManager.reset()
    this.circuitBreaker.reset()
  }

  /**
   * Gets execution statistics.
   */
  getStats(): {
    elapsed: number
    remaining: number
    toolCalls: number
    fileModifications: number
    successes: number
    failures: number
  } {
    const stats = this.stateManager.getStats()
    const elapsed = Date.now() - this.startTime

    return {
      elapsed,
      remaining: this.getTimeRemaining(),
      toolCalls: stats.toolCallCount,
      fileModifications: stats.fileModificationCount,
      successes: stats.successCount,
      failures: stats.failureCount,
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: ExecutionController | null = null

/**
 * Gets the singleton execution controller instance.
 */
export function getExecutionController(): ExecutionController {
  if (!instance) {
    instance = new ExecutionController()
  }
  return instance
}

/**
 * Creates a new execution controller with custom config.
 */
export function createExecutionController(config: ExecutionControl): ExecutionController {
  return new ExecutionController(config)
}

/**
 * Resets the singleton instance (for testing).
 */
export function resetExecutionController(): void {
  instance = null
}

export type { ExecutionControl, RetryPolicy }
