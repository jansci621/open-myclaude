/**
 * Web Chat Module
 *
 * This module provides a web-based chat interface for Claude Code.
 * It allows users to interact with Claude through a browser.
 */

// Re-export types
export * from './types.js'

// Re-export config
export { parseConfig, validateConfig, printConfig, parseArgs, printHelp, DEFAULT_CONFIG } from './config.js'

// Re-export server (will be implemented)
export { WebChatServer } from './server.js'

// Re-export session manager (will be implemented)
export { WebChatSessionManager } from './sessionManager.js'
