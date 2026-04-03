/**
 * Unattended mode permission handler.
 *
 * Integrates with the permission system to automatically approve
 * or deny tool executions based on unattended mode configuration.
 */

import type { Tool, ToolPermissionContext } from '../../Tool.js'
import {
  getUnattendedModeManager,
  type UnattendedPermissionCheck,
} from '../unattended/index.js'
import type {
  PermissionDecision,
  PermissionDenyDecision,
  PermissionDecisionReason,
} from '../../types/permissions.js'

// ============================================================================
// Handler Functions
// ============================================================================

/**
 * Checks if unattended mode is active.
 */
export function isUnattendedModeActive(context: ToolPermissionContext): boolean {
  return context.mode === 'unattended'
}

/**
 * Handles permission check for unattended mode.
 *
 * This function is called by the permission system when unattended mode
 * is active to determine if a tool can be auto-executed.
 */
export async function handleUnattendedPermission(
  tool: Tool<unknown, unknown>,
  input: unknown,
  context: ToolPermissionContext,
): Promise<PermissionDecision> {
  const manager = getUnattendedModeManager()

  if (!manager) {
    const reason: PermissionDecisionReason = {
      type: 'other',
      reason: 'Unattended mode not configured',
    }
    return {
      behavior: 'deny',
      message: 'Unattended mode is not configured. Use --unattended flag with proper configuration.',
      decisionReason: reason,
    }
  }

  // Check if execution is allowed
  const check = await manager.canAutoExecute(tool.name, input)

  if (check.allowed) {
    // Record the tool call start
    manager.recordToolCallStart(tool.name)

    return {
      behavior: 'allow',
      decisionReason: {
        type: 'mode',
        mode: 'unattended',
      },
    }
  }

  // Execution denied
  const reason: PermissionDecisionReason = {
    type: 'mode',
    mode: 'unattended',
  }

  return {
    behavior: 'deny',
    message: check.reason ?? 'Tool execution denied by unattended mode boundaries',
    decisionReason: reason,
  }
}

/**
 * Records a successful tool execution in unattended mode.
 */
export function recordUnattendedSuccess(toolName: string): void {
  const manager = getUnattendedModeManager()
  if (manager) {
    manager.recordToolCallSuccess(toolName)
  }
}

/**
 * Records a failed tool execution in unattended mode.
 */
export function recordUnattendedFailure(toolName: string, error: Error): void {
  const manager = getUnattendedModeManager()
  if (manager) {
    manager.recordToolCallFailure(toolName, error)
  }
}

/**
 * Checks if unattended mode is available for use.
 */
export function isUnattendedModeAvailable(): boolean {
  // Unattended mode is available if:
  // 1. Explicitly enabled via CLI flag
  // 2. Configuration is loaded
  const manager = getUnattendedModeManager()
  return manager !== null && manager.getConfig().enabled
}

/**
 * Gets a human-readable status message for unattended mode.
 */
export function getUnattendedModeStatusMessage(): string {
  const manager = getUnattendedModeManager()

  if (!manager) {
    return 'Unattended mode is not configured'
  }

  const status = manager.getStatus()
  const stats = manager.getStats()

  return `Unattended mode: ${status} | ` +
    `Tool calls: ${stats.toolCalls} | ` +
    `Successes: ${stats.successes} | ` +
    `Failures: ${stats.failures}`
}
