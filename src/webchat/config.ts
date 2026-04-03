/**
 * Web Chat Configuration
 *
 * Configuration management for the web chat server.
 */

import type { WebChatConfig, PermissionMode } from './types.js'
import {
  type UnattendedModeConfig,
  createDefaultUnattendedModeConfig,
} from '../types/unattended.js'

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: WebChatConfig = {
  port: 8080,
  host: 'localhost',
  corsOrigins: ['*'],
  maxSessions: 10,
  sessionTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
  permissionMode: 'ask',
  verbose: false,
}

/**
 * Parse configuration from partial config and environment variables
 *
 * Priority: passed values > environment variables > defaults
 */
export function parseConfig(partial: Partial<WebChatConfig> = {}): WebChatConfig {
  // Parse unattended config from environment if set
  let unattendedConfig: UnattendedModeConfig | undefined
  if (process.env.WEBCHAT_UNATTENDED === 'true' || partial.unattended) {
    unattendedConfig = {
      ...createDefaultUnattendedModeConfig(),
      enabled: true,
      ...partial.unattended,
    }
  }

  return {
    ...DEFAULT_CONFIG,
    ...partial,
    port: partial.port ?? parseInt(process.env.WEBCHAT_PORT ?? '8080', 10),
    host: partial.host ?? process.env.WEBCHAT_HOST ?? 'localhost',
    authToken: partial.authToken ?? process.env.WEBCHAT_AUTH_TOKEN,
    corsOrigins: partial.corsOrigins ?? parseCorsOrigins(process.env.WEBCHAT_CORS),
    maxSessions: partial.maxSessions ?? parseInt(process.env.WEBCHAT_MAX_SESSIONS ?? '10', 10),
    sessionTimeoutMs: partial.sessionTimeoutMs ?? DEFAULT_CONFIG.sessionTimeoutMs,
    permissionMode: partial.permissionMode ?? (process.env.WEBCHAT_PERMISSION_MODE as PermissionMode) ?? 'ask',
    verbose: partial.verbose ?? process.env.WEBCHAT_VERBOSE === 'true',
    workingDir: partial.workingDir ?? process.env.WEBCHAT_WORKING_DIR,
    cliPath: partial.cliPath ?? process.env.WEBCHAT_CLI_PATH,
    settingsPath: partial.settingsPath ?? process.env.WEBCHAT_SETTINGS,
    unattended: unattendedConfig,
    unattendedConfigPath: partial.unattendedConfigPath ?? process.env.WEBCHAT_UNATTENDED_CONFIG,
  }
}

/**
 * Parse CORS origins from comma-separated string
 */
function parseCorsOrigins(env?: string): string[] {
  if (!env) return DEFAULT_CONFIG.corsOrigins
  return env.split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * Validate configuration
 * Returns error message if invalid, null if valid
 */
export function validateConfig(config: WebChatConfig): string | null {
  if (config.port < 1 || config.port > 65535) {
    return `Invalid port: ${config.port}`
  }

  if (config.maxSessions < 1) {
    return `Invalid maxSessions: ${config.maxSessions}`
  }

  if (!['ask', 'auto-approve', 'auto-deny'].includes(config.permissionMode)) {
    return `Invalid permissionMode: ${config.permissionMode}`
  }

  return null
}

/**
 * Print configuration (for verbose mode)
 */
export function printConfig(config: WebChatConfig): void {
  console.log('Web Chat Configuration:')
  console.log(`  Host: ${config.host}`)
  console.log(`  Port: ${config.port}`)
  console.log(`  Max Sessions: ${config.maxSessions}`)
  console.log(`  Permission Mode: ${config.permissionMode}`)
  console.log(`  Auth Token: ${config.authToken ? '***set***' : 'none'}`)
  console.log(`  CORS Origins: ${config.corsOrigins.join(', ')}`)
  console.log(`  Working Dir: ${config.workingDir ?? 'current directory'}`)
  console.log(`  CLI Path: ${config.cliPath ?? 'auto-detect'}`)
  console.log(`  Settings: ${config.settingsPath ?? 'default'}`)
  console.log(`  Verbose: ${config.verbose}`)
  if (config.unattended?.enabled) {
    console.log(`  Unattended Mode: enabled`)
    console.log(`    - Max Duration: ${config.unattended.execution.maxDuration}ms`)
    console.log(`    - Max Tool Calls: ${config.unattended.execution.maxToolCalls}`)
    console.log(`    - Allowed Tools: ${config.unattended.boundaries.allowedTools.join(', ') || 'none'}`)
  } else if (config.unattendedConfigPath) {
    console.log(`  Unattended Config: ${config.unattendedConfigPath}`)
  }
}

/**
 * Command line argument parser
 */
export function parseArgs(args: string[]): Partial<WebChatConfig> {
  const config: Partial<WebChatConfig> = {}
  let unattendedEnabled = false
  const unattendedConfig: Partial<UnattendedModeConfig> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case '--port':
      case '-p':
        config.port = parseInt(args[++i], 10)
        break

      case '--host':
        config.host = args[++i]
        break

      case '--auth-token':
        config.authToken = args[++i]
        break

      case '--cors':
        config.corsOrigins = args[++i]?.split(',').map(s => s.trim()) ?? ['*']
        break

      case '--max-sessions':
        config.maxSessions = parseInt(args[++i], 10)
        break

      case '--permission-mode':
        config.permissionMode = args[++i] as PermissionMode
        break

      case '--working-dir':
      case '-d':
        config.workingDir = args[++i]
        break

      case '--verbose':
      case '-v':
        config.verbose = true
        break

      case '--cli-path':
        config.cliPath = args[++i]
        break

      case '--settings':
      case '-s':
        config.settingsPath = args[++i]
        break

      // Unattended mode options
      case '--unattended':
        unattendedEnabled = true
        break

      case '--unattended-config':
        config.unattendedConfigPath = args[++i]
        break

      case '--max-duration':
        unattendedEnabled = true
        unattendedConfig.execution = {
          ...unattendedConfig.execution,
          maxDuration: parseInt(args[++i], 10),
        }
        break

      case '--max-tool-calls':
        unattendedEnabled = true
        unattendedConfig.execution = {
          ...unattendedConfig.execution,
          maxToolCalls: parseInt(args[++i], 10),
        }
        break

      case '--allowed-tools':
        unattendedEnabled = true
        const tools = args[++i]?.split(',').map(s => s.trim()) ?? []
        unattendedConfig.boundaries = {
          ...unattendedConfig.boundaries,
          allowedTools: tools,
        }
        break

      case '--protected-paths':
        unattendedEnabled = true
        const paths = args[++i]?.split(',').map(s => s.trim()) ?? []
        unattendedConfig.boundaries = {
          ...unattendedConfig.boundaries,
          protectedPaths: paths,
        }
        break

      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }

  // Set unattended config if enabled
  if (unattendedEnabled) {
    config.unattended = {
      ...createDefaultUnattendedModeConfig(),
      enabled: true,
      ...unattendedConfig,
      boundaries: {
        ...createDefaultUnattendedModeConfig().boundaries,
        ...unattendedConfig.boundaries,
      },
      execution: {
        ...createDefaultUnattendedModeConfig().execution,
        ...unattendedConfig.execution,
      },
    }
  }

  return config
}

/**
 * Print help message
 */
export function printHelp(): void {
  console.log(`
Usage: claude webchat [options]

Start a web-based chat interface for Claude Code.

Options:
  -p, --port <number>       Port to listen on (default: 8080)
  --host <string>           Host to bind to (default: localhost)
  --auth-token <string>     API authentication token
  --cors <origins>          CORS origins, comma-separated (default: *)
  --max-sessions <number>   Maximum concurrent sessions (default: 10)
  --permission-mode <mode>  Permission mode: ask, auto-approve, auto-deny
  -d, --working-dir <path>  Default working directory for sessions
  --cli-path <path>         Path to Claude CLI (default: auto-detect)
  -s, --settings <path>     Path to settings file for model configuration
  -v, --verbose             Enable verbose logging
  --help                    Show this help message

Unattended Mode Options:
  --unattended              Enable unattended mode for autonomous execution
  --unattended-config <path> Path to unattended mode configuration file (JSON)
  --max-duration <ms>       Maximum execution duration in milliseconds
  --max-tool-calls <n>      Maximum number of tool calls allowed
  --allowed-tools <tools>   Comma-separated list of allowed tools
  --protected-paths <paths> Comma-separated list of protected paths

Environment Variables:
  WEBCHAT_PORT              Port to listen on
  WEBCHAT_HOST              Host to bind to
  WEBCHAT_AUTH_TOKEN        API authentication token
  WEBCHAT_CORS              CORS origins (comma-separated)
  WEBCHAT_MAX_SESSIONS      Maximum concurrent sessions
  WEBCHAT_PERMISSION_MODE   Permission mode
  WEBCHAT_WORKING_DIR       Default working directory
  WEBCHAT_CLI_PATH          Path to Claude CLI
  WEBCHAT_SETTINGS          Path to settings file
  WEBCHAT_VERBOSE           Enable verbose logging (true/false)
  WEBCHAT_UNATTENDED        Enable unattended mode (true/false)
  WEBCHAT_UNATTENDED_CONFIG Path to unattended mode configuration file

Examples:
  claude webchat
  claude webchat --port 3000 --host 0.0.0.0
  claude webchat --auth-token secret123 --permission-mode ask
  claude webchat --settings ~/.claude/settings.json
  claude webchat --unattended --allowed-tools Read,Grep,Glob
  WEBCHAT_PORT=9000 claude webchat
`)
}
