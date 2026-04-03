/**
 * Checkpoint management for unattended mode.
 *
 * Provides functionality to save and restore execution state
 * for recovery after interruptions or failures.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { homedir } from 'os'
import {
  type UnattendedModeState,
  type UnattendedModeConfig,
} from '../../types/unattended.js'
import { getUnattendedModeStateManager } from './state.js'
import { getAuditLogger } from './logger.js'

// ============================================================================
// Checkpoint Types
// ============================================================================

/**
 * Checkpoint data structure.
 */
export interface Checkpoint {
  /** Version for compatibility checking */
  version: number

  /** Timestamp when checkpoint was created */
  timestamp: number

  /** Configuration hash for validation */
  configHash: string

  /** Execution state at checkpoint time */
  state: UnattendedModeState

  /** Additional metadata */
  metadata: {
    sessionId?: string
    workingDirectory: string
    prompt?: string
  }
}

const CHECKPOINT_VERSION = 1

// ============================================================================
// Checkpoint Manager
// ============================================================================

/**
 * Manages checkpoints for unattended mode execution.
 */
export class CheckpointManager {
  private readonly checkpointPath: string
  private readonly interval: number
  private readonly enabled: boolean
  private lastCheckpointTime: number = 0
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor(config: { enabled: boolean; interval: number; path: string }) {
    this.enabled = config.enabled
    this.interval = config.interval
    this.checkpointPath = config.path.startsWith('~')
      ? resolve(homedir(), config.path.slice(1))
      : resolve(config.path)
  }

  /**
   * Starts automatic checkpointing at the configured interval.
   */
  startAutoCheckpoint(
    config: UnattendedModeConfig,
    metadata?: Checkpoint['metadata'],
  ): void {
    if (!this.enabled || this.intervalId) return

    this.intervalId = setInterval(() => {
      this.save(config, metadata)
    }, this.interval)
  }

  /**
   * Stops automatic checkpointing.
   */
  stopAutoCheckpoint(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Saves a checkpoint.
   */
  save(
    config: UnattendedModeConfig,
    metadata?: Checkpoint['metadata'],
  ): boolean {
    if (!this.enabled) return false

    try {
      const stateManager = getUnattendedModeStateManager()
      const state = stateManager.createSnapshot()

      const checkpoint: Checkpoint = {
        version: CHECKPOINT_VERSION,
        timestamp: Date.now(),
        configHash: this.hashConfig(config),
        state,
        metadata: metadata ?? {
          workingDirectory: process.cwd(),
        },
      }

      // Ensure directory exists
      const dir = dirname(this.checkpointPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      writeFileSync(
        this.checkpointPath,
        JSON.stringify(checkpoint, null, 2),
        'utf-8',
      )

      this.lastCheckpointTime = Date.now()
      stateManager.updateCheckpoint(checkpoint)

      getAuditLogger().logCheckpoint('saved', {
        path: this.checkpointPath,
        state: state.status,
      })

      return true
    } catch (error) {
      getAuditLogger().logError('checkpoint', error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }

  /**
   * Loads a checkpoint if it exists.
   */
  load(): Checkpoint | null {
    if (!this.enabled) return null

    try {
      if (!existsSync(this.checkpointPath)) {
        return null
      }

      const content = readFileSync(this.checkpointPath, 'utf-8')
      const checkpoint = JSON.parse(content) as Checkpoint

      // Validate version
      if (checkpoint.version !== CHECKPOINT_VERSION) {
        console.warn('Checkpoint version mismatch, ignoring')
        return null
      }

      getAuditLogger().logCheckpoint('loaded', {
        path: this.checkpointPath,
        timestamp: checkpoint.timestamp,
      })

      return checkpoint
    } catch (error) {
      getAuditLogger().logError('checkpoint', error instanceof Error ? error : new Error(String(error)))
      return null
    }
  }

  /**
   * Restores state from a checkpoint.
   */
  restore(checkpoint: Checkpoint): boolean {
    try {
      const stateManager = getUnattendedModeStateManager()
      stateManager.restoreFromSnapshot(checkpoint.state)

      getAuditLogger().logCheckpoint('restored', {
        status: checkpoint.state.status,
        toolCallCount: checkpoint.state.stats.toolCallCount,
      })

      return true
    } catch (error) {
      getAuditLogger().logError('checkpoint', error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }

  /**
   * Clears the checkpoint file.
   */
  clear(): void {
    try {
      if (existsSync(this.checkpointPath)) {
        unlinkSync(this.checkpointPath)
      }
      getAuditLogger().logCheckpoint('cleared')
    } catch {
      // Silently fail
    }
  }

  /**
   * Checks if a checkpoint exists.
   */
  exists(): boolean {
    return existsSync(this.checkpointPath)
  }

  /**
   * Gets the last checkpoint time.
   */
  getLastCheckpointTime(): number | null {
    return this.lastCheckpointTime > 0 ? this.lastCheckpointTime : null
  }

  /**
   * Validates that a checkpoint matches the current config.
   */
  validateConfig(checkpoint: Checkpoint, config: UnattendedModeConfig): boolean {
    const currentHash = this.hashConfig(config)
    return checkpoint.configHash === currentHash
  }

  /**
   * Creates a simple hash of the config for validation.
   */
  private hashConfig(config: UnattendedModeConfig): string {
    // Simple hash - just stringify relevant parts
    const relevant = {
      enabled: config.enabled,
      boundaries: {
        allowedTools: config.boundaries.allowedTools.sort(),
        deniedTools: config.boundaries.deniedTools.sort(),
      },
    }
    return Buffer.from(JSON.stringify(relevant)).toString('base64').slice(0, 32)
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a checkpoint manager from configuration.
 */
export function createCheckpointManager(
  enabled: boolean,
  interval: number,
  path: string,
): CheckpointManager {
  return new CheckpointManager({ enabled, interval, path })
}

/**
 * Gets the default checkpoint path.
 */
export function getDefaultCheckpointPath(): string {
  return resolve(homedir(), '.claude', 'unattended-checkpoint.json')
}

export type { Checkpoint }
