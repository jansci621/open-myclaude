/**
 * Notification system for unattended mode.
 *
 * Sends notifications via webhooks for completion, errors,
 * and periodic status reports.
 */

import { request } from 'http'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import {
  type NotificationConfig,
  type UnattendedModeState,
} from '../../types/unattended.js'
import { getAuditLogger } from './logger.js'

// ============================================================================
// Notification Types
// ============================================================================

/**
 * Payload sent to webhooks.
 */
export interface WebhookPayload {
  /** Event type */
  event: 'completed' | 'error' | 'status'

  /** Timestamp */
  timestamp: number

  /** Session ID if available */
  sessionId?: string

  /** Current status */
  status: UnattendedModeState['status']

  /** Execution statistics */
  stats: {
    toolCalls: number
    successes: number
    failures: number
    fileModifications: number
    durationMs: number
  }

  /** Error information if applicable */
  error?: {
    message: string
    code?: string
    toolName?: string
  }

  /** Recent errors */
  recentErrors?: Array<{
    timestamp: number
    toolName: string
    message: string
  }>
}

// ============================================================================
// Notification Manager
// ============================================================================

/**
 * Manages notifications for unattended mode.
 */
export class NotificationManager {
  private readonly config: NotificationConfig
  private statusIntervalId: ReturnType<typeof setInterval> | null = null

  constructor(config: NotificationConfig) {
    this.config = config
  }

  /**
   * Starts periodic status reporting.
   */
  startStatusReporting(getState: () => WebhookPayload): void {
    if (!this.config.statusReport.enabled || !this.config.statusReport.webhook) {
      return
    }

    if (this.statusIntervalId) {
      clearInterval(this.statusIntervalId)
    }

    this.statusIntervalId = setInterval(() => {
      this.sendStatusReport(getState())
    }, this.config.statusReport.interval)
  }

  /**
   * Stops periodic status reporting.
   */
  stopStatusReporting(): void {
    if (this.statusIntervalId) {
      clearInterval(this.statusIntervalId)
      this.statusIntervalId = null
    }
  }

  /**
   * Sends a completion notification.
   */
  async sendCompletionNotification(payload: WebhookPayload): Promise<boolean> {
    if (!this.config.onComplete.enabled) {
      return false
    }

    const webhook = this.config.onComplete.webhook
    if (!webhook) {
      return false
    }

    return this.sendWebhook(webhook, { ...payload, event: 'completed' })
  }

  /**
   * Sends an error notification.
   */
  async sendErrorNotification(payload: WebhookPayload): Promise<boolean> {
    if (!this.config.onError.enabled) {
      return false
    }

    const webhook = this.config.onError.webhook
    if (!webhook) {
      return false
    }

    return this.sendWebhook(webhook, { ...payload, event: 'error' })
  }

  /**
   * Sends a status report.
   */
  async sendStatusReport(payload: WebhookPayload): Promise<boolean> {
    if (!this.config.statusReport.enabled) {
      return false
    }

    const webhook = this.config.statusReport.webhook
    if (!webhook) {
      return false
    }

    return this.sendWebhook(webhook, { ...payload, event: 'status' })
  }

  /**
   * Sends a webhook request.
   */
  private async sendWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
    try {
      const parsedUrl = new URL(url)
      const isHttps = parsedUrl.protocol === 'https:'

      const body = JSON.stringify(payload)

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'Claude-Code-Unattended/1.0',
        },
        timeout: 10000, // 10 second timeout
      }

      return new Promise((resolve) => {
        const req = (isHttps ? httpsRequest : request)(options, (res) => {
          // Consume response data
          res.on('data', () => {})
          res.on('end', () => {
            const success = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300
            if (success) {
              getAuditLogger().logNotification('webhook_sent', {
                url: url.replace(/\/\/[^@]+@/, '//***@'), // Hide credentials
                status: res.statusCode,
              })
            }
            resolve(success)
          })
        })

        req.on('error', (error) => {
          getAuditLogger().logError('notification', error, { url: url.replace(/\/\/[^@]+@/, '//***@') })
          resolve(false)
        })

        req.on('timeout', () => {
          req.destroy()
          getAuditLogger().logError('notification', new Error('Webhook timeout'), { url })
          resolve(false)
        })

        req.write(body)
        req.end()
      })
    } catch (error) {
      getAuditLogger().logError('notification', error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a webhook payload from state.
 */
export function createWebhookPayload(
  state: UnattendedModeState,
  sessionId?: string,
): WebhookPayload {
  const stats = state.stats
  const durationMs = state.endTime
    ? state.endTime - state.startTime
    : Date.now() - state.startTime

  return {
    event: 'status',
    timestamp: Date.now(),
    sessionId,
    status: state.status,
    stats: {
      toolCalls: stats.toolCallCount,
      successes: stats.successCount,
      failures: stats.failureCount,
      fileModifications: stats.fileModificationCount,
      durationMs,
    },
    recentErrors: state.errors.slice(-5).map(e => ({
      timestamp: e.timestamp,
      toolName: e.toolName,
      message: e.message,
    })),
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let instance: NotificationManager | null = null

/**
 * Gets the singleton notification manager instance.
 */
export function getNotificationManager(): NotificationManager | null {
  return instance
}

/**
 * Initializes the notification manager.
 */
export function initializeNotificationManager(config: NotificationConfig): NotificationManager {
  instance = new NotificationManager(config)
  return instance
}

/**
 * Resets the singleton instance (for testing).
 */
export function resetNotificationManager(): void {
  if (instance) {
    instance.stopStatusReporting()
  }
  instance = null
}

export type { NotificationConfig, WebhookPayload }
