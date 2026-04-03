/**
 * Circuit breaker for unattended mode.
 *
 * Prevents runaway execution by opening the circuit after
 * consecutive failures, giving the system time to recover.
 */

import {
  type CircuitBreakerStatus,
} from '../../types/unattended.js'

// ============================================================================
// Circuit Breaker States
// ============================================================================

type CircuitState = 'closed' | 'open' | 'half-open'

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

/**
 * Configuration for the circuit breaker.
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures to trigger open state */
  failureThreshold: number

  /** Time in ms to wait before trying half-open state */
  resetTimeoutMs: number

  /** Number of successes in half-open to close the circuit */
  successThreshold: number
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 minute
  successThreshold: 2,
}

/**
 * Circuit breaker implementation for unattended mode.
 *
 * States:
 * - closed: Normal operation, requests pass through
 * - open: All requests blocked, waiting for reset timeout
 * - half-open: Testing if system recovered, limited requests allowed
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failureCount: number = 0
  private successCount: number = 0
  private lastFailureTime: number = 0
  private openedAt: number = 0
  private openReason: string | undefined
  private readonly config: CircuitBreakerConfig

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Checks if the circuit is open (blocking requests).
   */
  isOpen(): boolean {
    this.updateState()
    return this.state === 'open'
  }

  /**
   * Gets the current circuit breaker status.
   */
  getStatus(): CircuitBreakerStatus {
    this.updateState()
    return {
      isOpen: this.state === 'open',
      failureCount: this.failureCount,
      openedAt: this.state === 'open' ? this.openedAt : undefined,
      reason: this.openReason,
    }
  }

  /**
   * Gets the current state.
   */
  getState(): CircuitState {
    this.updateState()
    return this.state
  }

  /**
   * Records a successful operation.
   */
  recordSuccess(): void {
    this.lastFailureTime = 0

    if (this.state === 'half-open') {
      this.successCount++
      if (this.successCount >= this.config.successThreshold) {
        this.close()
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      this.failureCount = 0
    }
  }

  /**
   * Records a failed operation.
   */
  recordFailure(reason?: string): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    this.successCount = 0

    if (this.state === 'half-open') {
      // Failure in half-open immediately opens circuit
      this.open(reason)
    } else if (this.state === 'closed') {
      if (this.failureCount >= this.config.failureThreshold) {
        this.open(reason)
      }
    }
  }

  /**
   * Manually opens the circuit.
   */
  open(reason?: string): void {
    this.state = 'open'
    this.openedAt = Date.now()
    this.openReason = reason ?? 'Circuit breaker opened due to failures'
  }

  /**
   * Manually closes the circuit.
   */
  close(): void {
    this.state = 'closed'
    this.failureCount = 0
    this.successCount = 0
    this.openReason = undefined
  }

  /**
   * Manually resets the circuit breaker.
   */
  reset(): void {
    this.state = 'closed'
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = 0
    this.openedAt = 0
    this.openReason = undefined
  }

  /**
   * Updates the state based on time (for half-open transition).
   */
  private updateState(): void {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt
      if (elapsed >= this.config.resetTimeoutMs) {
        this.state = 'half-open'
        this.successCount = 0
      }
    }
  }

  /**
   * Gets a diagnostic message about the circuit state.
   */
  getDiagnosticMessage(): string {
    const status = this.getStatus()
    if (!status.isOpen) {
      return `Circuit breaker is closed (failures: ${status.failureCount}/${this.config.failureThreshold})`
    }
    return `Circuit breaker is open: ${status.reason} (opened ${Math.round((Date.now() - (status.openedAt ?? 0)) / 1000)}s ago)`
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: CircuitBreaker | null = null

/**
 * Gets the singleton circuit breaker instance.
 */
export function getCircuitBreaker(): CircuitBreaker {
  if (!instance) {
    instance = new CircuitBreaker()
  }
  return instance
}

/**
 * Creates a new circuit breaker with custom config.
 */
export function createCircuitBreaker(config: Partial<CircuitBreakerConfig>): CircuitBreaker {
  return new CircuitBreaker(config)
}

/**
 * Resets the singleton instance (for testing).
 */
export function resetCircuitBreaker(): void {
  instance = null
}

export type { CircuitBreakerStatus }
