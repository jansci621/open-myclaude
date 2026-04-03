/**
 * Web Chat Types - Type definitions for the web chat interface
 *
 * This module defines the types used by the web chat server and client.
 */

import type { UnattendedModeConfig } from '../types/unattended.js'

/**
 * Web Chat server configuration
 */
export type WebChatConfig = {
  /** HTTP port, default 8080 */
  port: number
  /** Host to bind, default 'localhost' */
  host: string
  /** Optional API authentication token */
  authToken?: string
  /** CORS allowed origins */
  corsOrigins: string[]
  /** Maximum concurrent sessions, default 10 */
  maxSessions: number
  /** Session timeout in milliseconds, default 24 hours */
  sessionTimeoutMs: number
  /** Permission handling mode */
  permissionMode: PermissionMode
  /** Enable verbose logging */
  verbose: boolean
  /** Working directory for Claude Code sessions */
  workingDir?: string
  /** Path to Claude CLI (defaults to cli.js in project root) */
  cliPath?: string
  /** Path to settings file for model configuration */
  settingsPath?: string
  /** Unattended mode configuration */
  unattended?: UnattendedModeConfig
  /** Path to unattended mode configuration file */
  unattendedConfigPath?: string
}

/**
 * Permission handling mode
 * - 'ask': Always ask user for permission
 * - 'auto-approve': Automatically approve all requests (testing only)
 * - 'auto-deny': Automatically deny all requests
 */
export type PermissionMode = 'ask' | 'auto-approve' | 'auto-deny'

/**
 * Session connection status
 */
export type SessionStatus =
  | 'connecting'   // Establishing connection
  | 'connected'    // Ready to send/receive messages
  | 'disconnected' // Connection closed
  | 'error'        // Error occurred

/**
 * Web client session state
 */
export type WebClientSession = {
  /** Unique session identifier */
  id: string
  /** Claude Code internal session ID */
  claudeSessionId: string
  /** Session creation timestamp */
  createdAt: Date
  /** Last activity timestamp */
  lastActivityAt: Date
  /** Current connection status */
  status: SessionStatus
  /** Message history */
  messages: WebChatMessage[]
  /** Current pending permission request, if any */
  pendingPermissionRequest?: PendingPermissionRequest
  /** Working directory for this session */
  workingDir: string
}

/**
 * Web chat message (simplified format for frontend)
 */
export type WebChatMessage = {
  /** Unique message identifier */
  id: string
  /** Message role */
  role: 'user' | 'assistant' | 'system'
  /** Message content */
  content: string | MessageContent[]
  /** ISO timestamp */
  timestamp: string
  /** Message status for streaming */
  status?: 'streaming' | 'complete' | 'error'
}

/**
 * Message content types
 */
export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: Record<string, unknown>; id?: string }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

/**
 * Pending permission request
 */
export type PendingPermissionRequest = {
  /** Request ID for correlation */
  requestId: string
  /** Tool name being requested */
  toolName: string
  /** Tool input parameters */
  toolInput: Record<string, unknown>
  /** Tool use ID from the message */
  toolUseId: string
  /** Optional description of the action */
  description?: string
  /** Optional title for the permission dialog */
  title?: string
  /** Request timestamp */
  timestamp: Date
}

/**
 * WebSocket message protocol
 */
export type WebSocketMessage =
  | { type: 'message'; payload: WebChatMessage & { sessionId: string } }
  | { type: 'message_update'; payload: WebChatMessage & { sessionId: string } }
  | { type: 'message_stream'; payload: { sessionId: string; messageId: string; delta: string } }
  | { type: 'thinking'; payload: { sessionId: string; messageId: string; content: string } }
  | { type: 'tool_use'; payload: { sessionId: string; messageId: string; name: string; input: Record<string, unknown> } }
  | { type: 'tool_result'; payload: { sessionId: string; toolUseId: string; content: string; isError?: boolean } }
  | { type: 'permission_request'; payload: PendingPermissionRequest & { sessionId: string } }
  | { type: 'permission_resolved'; payload: { sessionId: string; requestId: string; approved: boolean } }
  | { type: 'session_status'; payload: { sessionId: string; status: SessionStatus } }
  | { type: 'sessions_list'; payload: { sessions: WebClientSession[] } }
  | { type: 'session_created'; payload: WebClientSession & { sessionId: string } }
  | {
      type: 'plugin_operation'
      payload: {
        action: 'install' | 'uninstall' | 'toggle' | 'update'
        pluginId: string
        phase: 'started' | 'succeeded' | 'failed'
        message: string
      }
    }
  | { type: 'plugins_changed'; payload: Record<string, never> }
  | { type: 'error'; payload: { message: string; sessionId?: string; code?: string } }
  | { type: 'ping' }
  | { type: 'pong' }

/**
 * HTTP API response wrapper
 */
export type ApiResponse<T = unknown> = {
  success: boolean
  data?: T
  error?: { message: string; code?: string }
}

/**
 * Session creation request body
 */
export type CreateSessionRequest = {
  workingDir?: string
  permissionMode?: PermissionMode
}

/**
 * Send message request body
 */
export type SendMessageRequest = {
  content: string
}

/**
 * Permission response request body
 */
export type PermissionResponseRequest = {
  approved: boolean
  message?: string
}

/**
 * Session manager callbacks
 */
export type SessionManagerCallbacks = {
  /** Called when a new message is received */
  onMessage: (sessionId: string, message: WebChatMessage) => void
  /** Called when a message is updated (streaming) */
  onMessageUpdate: (sessionId: string, message: WebChatMessage) => void
  /** Called when a streaming delta is received */
  onStreamDelta: (sessionId: string, messageId: string, delta: string) => void
  /** Called when thinking content is received */
  onThinking: (sessionId: string, messageId: string, content: string) => void
  /** Called when a tool use starts */
  onToolUse: (sessionId: string, messageId: string, name: string, input: Record<string, unknown>) => void
  /** Called when a tool result is received */
  onToolResult: (sessionId: string, toolUseId: string, content: string, isError?: boolean) => void
  /** Called when a permission request is received */
  onPermissionRequest: (sessionId: string, request: PendingPermissionRequest) => void
  /** Called when session status changes */
  onStatusChange: (sessionId: string, status: SessionStatus) => void
  /** Called when an error occurs */
  onError: (sessionId: string, error: Error) => void
}

/**
 * Client WebSocket state
 */
export type ClientState = {
  id: string
  ws: WebSocket
  sessionId?: string
  connectedAt: Date
}
