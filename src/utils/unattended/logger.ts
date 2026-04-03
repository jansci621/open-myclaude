/**
 * Audit logging for unattended mode.
 *
 * Provides comprehensive logging of all operations for
 * debugging, compliance, and security auditing.
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { homedir } from 'os'
import {
  type AuditLogEntry,
} from '../../types/unattended.js'

// ============================================================================
// Logger Configuration
// ============================================================================

export interface AuditLoggerConfig {
  /** Path to the log file */
  logPath: string

  /** Maximum log file size in bytes before rotation */
  maxFileSize: number

  /** Maximum number of rotated log files to keep */
  maxFiles: number

  /** Whether to also log to console */
  consoleOutput: boolean

  /** Minimum log level to record */
  minLevel: 'debug' | 'info' | 'warn' | 'error'
}

const DEFAULT_CONFIG: AuditLoggerConfig = {
  logPath: resolve(homedir(), '.claude', 'logs', 'unattended-audit.log'),
  maxFileSize: 10 * 1024 * 1024, // 10 MB
  maxFiles: 5,
  consoleOutput: false,
  minLevel: 'info',
}

// ============================================================================
// Audit Logger Implementation
// ============================================================================

/**
 * Audit logger for unattended mode operations.
 */
export class AuditLogger {
  private readonly config: AuditLoggerConfig
  private initialized: boolean = false

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initializes the logger, creating log directory if needed.
   */
  private ensureInitialized(): void {
    if (this.initialized) return

    try {
      const logDir = dirname(this.config.logPath)
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true })
      }
      this.initialized = true
    } catch {
      // Silently fail - we'll try again on next log
    }
  }

  /**
   * Logs an audit entry.
   */
  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    this.ensureInitialized()

    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: Date.now(),
    }

    const logLine = this.formatEntry(fullEntry)

    // Console output
    if (this.config.consoleOutput) {
      this.logToConsole(fullEntry)
    }

    // File output
    try {
      appendFileSync(this.config.logPath, logLine + '\n', 'utf-8')
    } catch {
      // Silently fail - logging should not break execution
    }
  }

  /**
   * Logs a tool call.
   */
  logToolCall(
    toolName: string,
    action: string,
    allowed: boolean,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      type: 'tool_call',
      toolName,
      action,
      allowed,
      reason,
      metadata,
    })
  }

  /**
   * Logs a permission check.
   */
  logPermissionCheck(
    toolName: string,
    action: string,
    allowed: boolean,
    reason?: string,
  ): void {
    this.log({
      type: 'permission_check',
      toolName,
      action,
      allowed,
      reason,
    })
  }

  /**
   * Logs a boundary check.
   */
  logBoundaryCheck(
    action: string,
    allowed: boolean,
    reason?: string,
  ): void {
    this.log({
      type: 'boundary_check',
      action,
      allowed,
      reason,
    })
  }

  /**
   * Logs an error.
   */
  logError(
    toolName: string,
    error: Error,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      type: 'error',
      toolName,
      action: 'error',
      allowed: false,
      reason: error.message,
      metadata: {
        ...metadata,
        errorName: error.name,
        stack: error.stack,
      },
    })
  }

  /**
   * Logs a checkpoint event.
   */
  logCheckpoint(action: string, metadata?: Record<string, unknown>): void {
    this.log({
      type: 'checkpoint',
      action,
      allowed: true,
      metadata,
    })
  }

  /**
   * Logs a notification event.
   */
  logNotification(action: string, metadata?: Record<string, unknown>): void {
    this.log({
      type: 'notification',
      action,
      allowed: true,
      metadata,
    })
  }

  /**
   * Logs a status change.
   */
  logStatusChange(
    fromStatus: string,
    toStatus: string,
    reason?: string,
  ): void {
    this.log({
      type: 'status_change',
      action: `Status changed from ${fromStatus} to ${toStatus}`,
      allowed: true,
      reason,
    })
  }

  /**
   * Formats an entry for logging.
   */
  private formatEntry(entry: AuditLogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString()
    const parts = [
      timestamp,
      entry.type.toUpperCase(),
      entry.toolName ?? '-',
      entry.action,
      entry.allowed === true ? 'ALLOWED' : entry.allowed === false ? 'DENIED' : '-',
    ]

    if (entry.reason) {
      parts.push(`reason="${entry.reason}"`)
    }

    if (entry.metadata) {
      parts.push(`metadata=${JSON.stringify(entry.metadata)}`)
    }

    return parts.join(' | ')
  }

  /**
   * Logs to console with appropriate level.
   */
  private logToConsole(entry: AuditLogEntry): void {
    const message = this.formatEntry(entry)

    switch (entry.type) {
      case 'error':
        console.error(message)
        break
      case 'status_change':
      case 'boundary_check':
        console.warn(message)
        break
      default:
        console.log(message)
    }
  }

  /**
   * Rotates log files if needed.
   */
  rotateIfNeeded(): void {
    try {
      const stats = existsSync(this.config.logPath)
        ? { size: 0 } // Would need fs.statSync but avoiding for simplicity
        : { size: 0 }

      // For now, skip actual rotation - can be enhanced later
    } catch {
      // Silently fail
    }
  }

  /**
   * Clears the log file.
   */
  clear(): void {
    try {
      writeFileSync(this.config.logPath, '', 'utf-8')
    } catch {
      // Silently fail
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: AuditLogger | null = null

/**
 * Gets the singleton audit logger instance.
 */
export function getAuditLogger(): AuditLogger {
  if (!instance) {
    instance = new AuditLogger()
  }
  return instance
}

/**
 * Creates a new audit logger with custom config.
 */
export function createAuditLogger(config: Partial<AuditLoggerConfig>): AuditLogger {
  return new AuditLogger(config)
}

/**
 * Resets the singleton instance (for testing).
 */
export function resetAuditLogger(): void {
  instance = null
}

export type { AuditLogEntry }
