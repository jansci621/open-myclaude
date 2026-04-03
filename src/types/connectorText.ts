/**
 * Connector Text Block Types
 *
 * Used for CONNECTOR_TEXT feature flag functionality
 */

import { feature } from 'bun:bundle'

/**
 * Connector text block type for API responses
 */
export interface ConnectorTextBlock {
  type: 'connector_text'
  connector_text: string
}

/**
 * Connector text delta for streaming
 */
export interface ConnectorTextDelta {
  type: 'connector_text_delta'
  delta: string
}

/**
 * Type guard to check if a block is a ConnectorTextBlock
 */
export function isConnectorTextBlock(block: unknown): block is ConnectorTextBlock {
  if (!feature('CONNECTOR_TEXT')) {
    return false
  }
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as Record<string, unknown>).type === 'connector_text' &&
    typeof (block as Record<string, unknown>).connector_text === 'string'
  )
}

/**
 * Type guard to check if a delta is a ConnectorTextDelta
 */
export function isConnectorTextDelta(delta: unknown): delta is ConnectorTextDelta {
  if (!feature('CONNECTOR_TEXT')) {
    return false
  }
  return (
    typeof delta === 'object' &&
    delta !== null &&
    (delta as Record<string, unknown>).type === 'connector_text_delta' &&
    typeof (delta as Record<string, unknown>).delta === 'string'
  )
}
