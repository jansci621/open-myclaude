/**
 * State management for unattended mode execution.
 *
 * Tracks execution counts, status, errors, and provides methods
 * for updating and querying state.
 */

import {
  type UnattendedModeState,
  type UnattendedModeStatus,
  type UnattendedError,
  type ExecutionStats,
  createInitialUnattendedModeState,
} from '../../types/unattended.js'

// ============================================================================
// State Manager
// ============================================================================

/**
 * Manages the runtime state of unattended mode execution.
 */
export class UnattendedModeStateManager {
  private state: UnattendedModeState
  private readonly maxErrors: number

  constructor(maxErrors: number = 100) {
    this.state = createInitialUnattendedModeState()
    this.maxErrors = maxErrors
  }

  /**
   * Gets the current state (read-only snapshot).
   */
  getState(): Readonly<UnattendedModeState> {
    return { ...this.state }
  }

  /**
   * Gets the current status.
   */
  getStatus(): UnattendedModeStatus {
    return this.state.status
  }

  /**
   * Sets the status.
   */
  setStatus(status: UnattendedModeStatus): void {
    this.state.status = status
    if (status === 'completed' || status === 'failed' || status === 'stopped') {
      this.state.endTime = Date.now()
    }
  }

  /**
   * Gets the execution statistics.
   */
  getStats(): Readonly<ExecutionStats> {
    return { ...this.state.stats }
  }

  /**
   * Increments the tool call count.
   */
  incrementToolCallCount(): number {
    return ++this.state.stats.toolCallCount
  }

  /**
   * Records a successful tool call.
   */
  recordSuccess(): void {
    this.state.stats.successCount++
  }

  /**
   * Records a failed tool call.
   */
  recordFailure(): void {
    this.state.stats.failureCount++
  }

  /**
   * Increments the file modification count.
   * @returns The new count
   */
  incrementFileModificationCount(): number {
    return ++this.state.stats.fileModificationCount
  }

  /**
   * Adds bytes to the bytes read counter.
   */
  addBytesRead(bytes: number): void {
    this.state.stats.bytesRead += bytes
  }

  /**
   * Adds bytes to the bytes written counter.
   */
  addBytesWritten(bytes: number): void {
    this.state.stats.bytesWritten += bytes
  }

  /**
   * Records an error.
   */
  recordError(error: Omit<UnattendedError, 'timestamp'>): void {
    const fullError: UnattendedError = {
      ...error,
      timestamp: Date.now(),
    }

    this.state.errors.push(fullError)

    // Trim errors if we exceed max
    if (this.state.errors.length > this.maxErrors) {
      this.state.errors = this.state.errors.slice(-this.maxErrors)
    }
  }

  /**
   * Gets all recorded errors.
   */
  getErrors(): ReadonlyArray<UnattendedError> {
    return [...this.state.errors]
  }

  /**
   * Gets the error count.
   */
  getErrorCount(): number {
    return this.state.errors.length
  }

  /**
   * Gets recent errors (last N errors).
   */
  getRecentErrors(count: number = 10): UnattendedError[] {
    return this.state.errors.slice(-count)
  }

  /**
   * Updates checkpoint time and data.
   */
  updateCheckpoint(data?: unknown): void {
    this.state.lastCheckpointTime = Date.now()
    this.state.lastCheckpointData = data
  }

  /**
   * Gets the last checkpoint data.
   */
  getLastCheckpointData(): unknown | undefined {
    return this.state.lastCheckpointData
  }

  /**
   * Gets the elapsed time in milliseconds.
   */
  getElapsedTime(): number {
    const endTime = this.state.endTime ?? Date.now()
    return endTime - this.state.startTime
  }

  /**
   * Gets the start time.
   */
  getStartTime(): number {
    return this.state.startTime
  }

  /**
   * Resets the state to initial values.
   */
  reset(): void {
    this.state = createInitialUnattendedModeState()
  }

  /**
   * Creates a serializable snapshot for checkpointing.
   */
  createSnapshot(): UnattendedModeState {
    return {
      ...this.state,
      errors: [...this.state.errors],
    }
  }

  /**
   * Restores state from a snapshot.
   */
  restoreFromSnapshot(snapshot: UnattendedModeState): void {
    this.state = {
      ...snapshot,
      errors: [...snapshot.errors],
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: UnattendedModeStateManager | null = null

/**
 * Gets the singleton state manager instance.
 */
export function getUnattendedModeStateManager(): UnattendedModeStateManager {
  if (!instance) {
    instance = new UnattendedModeStateManager()
  }
  return instance
}

/**
 * Resets the singleton instance (for testing).
 */
export function resetStateManager(): void {
  instance = null
}

export type { UnattendedModeState, UnattendedModeStatus, UnattendedError, ExecutionStats }
