/**
 * Web Chat Session Manager
 *
 * Manages Claude Code sessions for web clients.
 * Uses an in-process QueryEngine runner for chat execution.
 */

import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { QueryEngineWebChatRunner } from './queryEngineRunner.js'
import type {
  WebChatConfig,
  WebClientSession,
  WebChatMessage,
  PendingPermissionRequest,
  SessionManagerCallbacks,
  SessionStatus,
  MessageContent,
} from './types.js'

/**
 * Internal session state
 */
type InternalSession = WebClientSession & {
  process: ChildProcess | null
  runner: QueryEngineWebChatRunner | null
  pendingRequests: Map<string, PendingPermissionRequest>
  currentStreamingMessageId: string | null
}

type PermissionRequestLike = {
  tool_name: string
  input: Record<string, unknown>
  tool_use_id: string
  description?: string
  title?: string
}

type SDKMessageLike = { type: string; [key: string]: unknown }

/**
 * Manages multiple Claude Code sessions for web clients
 */
export class WebChatSessionManager {
  private sessions = new Map<string, InternalSession>()
  private config: WebChatConfig
  private callbacks: SessionManagerCallbacks

  constructor(config: WebChatConfig, callbacks: SessionManagerCallbacks) {
    this.config = config
    this.callbacks = callbacks
  }

  /**
   * Create a new Claude Code session
   */
  async createSession(workingDir?: string): Promise<WebClientSession> {
    // Check session limit
    if (this.sessions.size >= this.config.maxSessions) {
      throw new Error('Maximum sessions reached')
    }

    const sessionId = randomUUID()
    const claudeSessionId = randomUUID()
    const cwd = workingDir ?? this.config.workingDir ?? process.cwd()

    // Create session record
    const session: InternalSession = {
      id: sessionId,
      claudeSessionId,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      status: 'connecting',
      messages: [],
      workingDir: cwd,
      process: null,
      runner: null,
      pendingRequests: new Map(),
      currentStreamingMessageId: null,
    }

    this.sessions.set(sessionId, session)

    try {
      await this.startInProcessRunner(session)
      session.status = 'connected'
      this.callbacks.onStatusChange(sessionId, 'connected')
    } catch (error) {
      session.status = 'error'
      this.callbacks.onStatusChange(sessionId, 'error')
      this.callbacks.onError(sessionId, error instanceof Error ? error : new Error(String(error)))
      throw error
    }

    return this.getSession(sessionId)!
  }

  private async startInProcessRunner(session: InternalSession): Promise<void> {
    const runner = new QueryEngineWebChatRunner({
      config: this.config,
      workingDir: session.workingDir,
      sessionId: session.claudeSessionId,
      callbacks: {
        onSdkMessage: message => this.handleSdkMessage(session, message),
        onPermissionRequest: (requestId, request) =>
          this.handlePermissionRequestFromRunner(session, requestId, request),
        onError: error => {
          this.log(`[${session.id}] Runner error: ${error.message}`)
          session.status = 'error'
          this.callbacks.onStatusChange(session.id, 'error')
          this.callbacks.onError(session.id, error)
        },
      },
    })

    session.runner = runner
    await runner.init()
  }

  /**
   * Spawn Claude Code subprocess
   */
  private async spawnClaudeProcess(session: InternalSession): Promise<void> {
    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',  // Required for stream-json output
      '--session-id', session.claudeSessionId,
    ]

    // Add permission mode
    // When unattended mode is enabled, force permission-mode to 'unattended'
    if (this.config.unattended?.enabled || this.config.unattendedConfigPath) {
      args.push('--permission-mode', 'unattended')
    } else if (this.config.permissionMode !== 'ask') {
      // 映射应用层模式到 CLI 模式
      const modeMap: Record<string, string> = {
        'auto-approve': 'bypassPermissions',
        'auto-deny': 'default',
      }
      const cliMode = modeMap[this.config.permissionMode] || this.config.permissionMode
      args.push('--permission-mode', cliMode)
    }

    // Add verbose flag
    if (this.config.verbose) {
      args.push('--verbose')
    }

    // Add settings file if specified
    if (this.config.settingsPath) {
      args.push('--settings', this.config.settingsPath)
    }

    // Add unattended mode flags if configured
    if (this.config.unattended?.enabled) {
      args.push('--unattended')

      if (this.config.unattended.execution.maxDuration) {
        args.push('--max-duration', String(this.config.unattended.execution.maxDuration))
      }

      if (this.config.unattended.execution.maxToolCalls) {
        args.push('--max-tool-calls', String(this.config.unattended.execution.maxToolCalls))
      }

      if (this.config.unattended.boundaries.allowedTools.length > 0) {
        args.push('--allowed-tools', this.config.unattended.boundaries.allowedTools.join(','))
      }

      if (this.config.unattended.boundaries.protectedPaths.length > 0) {
        args.push('--protected-paths', this.config.unattended.boundaries.protectedPaths.join(','))
      }
    }

    // Add unattended config file if specified
    if (this.config.unattendedConfigPath) {
      args.push('--unattended-config', this.config.unattendedConfigPath)
    }

    this.log(`Spawning Claude Code for session ${session.id}`)
    this.log(`Working directory: ${session.workingDir}`)
    this.log(`Args: ${args.join(' ')}`)

    // Determine the CLI path - prefer main.tsx for development (supports new features)
    const cliPath = this.config.cliPath ?? this.findCliPath()
    if (!cliPath) {
      throw new Error('Could not find Claude CLI. Set --cli-path or ensure cli.js is in the project directory.')
    }
    this.log(`CLI path: ${cliPath}`)

    // Check if we should use bun to run TypeScript directly (for development)
    // Also use bun for bundled cli.js (built with --target=bun)
    const useBun = cliPath.endsWith('.tsx') || cliPath.endsWith('.ts') ||
      cliPath.endsWith('cli.js') || // Bundled JS requires bun runtime
      (process.env.CLAUDE_CODE_DEV === 'true')

    // For TypeScript/TSX files, we need to run from the package root
    // so that src/ path aliases work correctly
    let spawnCwd = session.workingDir
    if (cliPath.endsWith('.tsx') || cliPath.endsWith('.ts')) {
      // Find package root (directory containing tsconfig.json)
      const cliDir = cliPath.substring(0, cliPath.lastIndexOf('/'))
      // Handle both src/main.tsx and src/entrypoints/cli.tsx
      const srcIndex = cliDir.lastIndexOf('/src')
      if (srcIndex > 0) {
        spawnCwd = cliDir.substring(0, srcIndex)
      } else {
        // Try to find tsconfig.json
        let dir = cliDir
        for (let i = 0; i < 10 && dir !== '/'; i++) {
          if (existsSync(dir + '/tsconfig.json')) {
            spawnCwd = dir
            break
          }
          dir = dir.substring(0, dir.lastIndexOf('/'))
        }
      }
      this.log(`TypeScript file detected, setting cwd to package root: ${spawnCwd}`)
    }

    // Prepare environment for bun subprocess
    const env: Record<string, string | undefined> = {
      ...process.env,
      CLAUDE_CODE_SESSION_ID: session.claudeSessionId,
      // Ensure bun can resolve .js imports to .ts files
      NODE_ENV: process.env.NODE_ENV ?? 'development',
      // Enable bun's TypeScript support
      BUN_FEATURE_FLAG: process.env.BUN_FEATURE_FLAG,
      // Disable telemetry for subprocess
      CLAUDE_CODE_DISABLE_TELEMETRY: '1',
      // Pass the working directory so the CLI knows where to operate
      CLAUDE_CODE_WORKING_DIR: session.workingDir,
    }

    if (this.shouldDisableClaudeAIMcpServers()) {
      env.ENABLE_CLAUDEAI_MCP_SERVERS = 'false'
      this.log(
        'Disabling Claude.ai MCP server auto-init for non-first-party ANTHROPIC_BASE_URL',
      )
    }

    // For TypeScript files, use bun directly without 'run' subcommand
    // bun automatically handles .ts/.tsx files and module resolution
    const child = spawn(
      useBun ? 'bun' : process.execPath,
      useBun ? [cliPath, ...args] : [cliPath, ...args],
      {
      cwd: spawnCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      windowsHide: true,
    })

    session.process = child

    // Handle stdout (NDJSON messages)
    if (child.stdout) {
      const rl = createInterface({ input: child.stdout })
      rl.on('line', (line: string) => {
        this.handleStdoutLine(session, line)
      })
    }

    // Handle stderr (debug/error output)
    if (child.stderr) {
      const rl = createInterface({ input: child.stderr })
      rl.on('line', (line: string) => {
        this.log(`[${session.id}] stderr: ${line}`)
        // Check for startup errors
        if (line.includes('Error:') || line.includes('error:')) {
          this.callbacks.onError(session.id, new Error(line))
        }
      })
    }

    // Handle process exit
    child.on('close', (code, signal) => {
      this.log(`[${session.id}] Process exited with code ${code}, signal ${signal}`)
      session.status = 'disconnected'
      session.process = null
      this.callbacks.onStatusChange(session.id, 'disconnected')

      // If process exited with error, notify
      if (code !== 0 && code !== null) {
        this.callbacks.onError(session.id, new Error(`Process exited with code ${code}`))
      }
    })

    child.on('error', (error) => {
      this.log(`[${session.id}] Process error: ${error.message}`)
      session.status = 'error'
      this.callbacks.onStatusChange(session.id, 'error')
      this.callbacks.onError(session.id, error)
    })

    // Wait for process to be ready (check if it's still running)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // If process is still running after 2 seconds, consider it started
        if (child.pid && !child.killed) {
          resolve(undefined)
        } else {
          reject(new Error('Process failed to start'))
        }
      }, 2000)

      child.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })

      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          reject(new Error(`Process exited immediately with code ${code}`))
        }
      })
    })
  }

  /**
   * Handle a line from Claude Code stdout
   */
  private handleStdoutLine(session: InternalSession, line: string): void {
    this.log(`[${session.id}] <<< ${line.slice(0, 200)}...`)

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return
    }

    if (!parsed || typeof parsed !== 'object') {
      return
    }

    const msg = parsed as Record<string, unknown>
    session.lastActivityAt = new Date()

    // Handle different message types
    switch (msg.type as string) {
      case 'assistant':
        this.handleAssistantMessage(session, msg)
        break

      case 'result':
        this.handleResultMessage(session, msg)
        break

      case 'system':
        this.handleSystemMessage(session, msg)
        break

      case 'control_request':
        this.handleControlRequest(session, msg)
        break

      case 'stream_event':
        this.handleStreamEvent(session, msg)
        break
    }
  }

  /**
   * Handle assistant message
   */
  private handleAssistantMessage(session: InternalSession, msg: Record<string, unknown>): void {
    const message = msg.message as Record<string, unknown> | undefined
    const content = message?.content

    // Skip thinking-only messages - we'll show the final text response
    if (Array.isArray(content)) {
      const hasText = content.some((block: unknown) => {
        const b = block as Record<string, unknown>
        return b.type === 'text' && typeof b.text === 'string' && b.text.trim()
      })
      const hasOnlyThinking = content.every((block: unknown) => {
        const b = block as Record<string, unknown>
        return b.type === 'thinking'
      })

      // Skip if only thinking content (we'll get the text response later)
      if (hasOnlyThinking && !hasText) {
        return
      }
    }

    const webMessage: WebChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: this.convertContent(content),
      timestamp: new Date().toISOString(),
      status: 'complete',
    }

    session.messages.push(webMessage)
    this.callbacks.onMessage(session.id, webMessage)
  }

  /**
   * Handle result message
   */
  private handleResultMessage(session: InternalSession, msg: Record<string, unknown>): void {
    const subtype = msg.subtype as string
    const result = msg.result as string | undefined

    // Only show result if there was an error
    if (subtype !== 'success') {
      const webMessage: WebChatMessage = {
        id: randomUUID(),
        role: 'system',
        content: `Error: ${(msg.errors as string[])?.join(', ') ?? 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        status: 'error',
      }

      session.messages.push(webMessage)
      this.callbacks.onMessage(session.id, webMessage)
    }
  }

  /**
   * Handle system message
   */
  private handleSystemMessage(session: InternalSession, msg: Record<string, unknown>): void {
    // Skip init messages - they're not useful to display
    if (msg.subtype === 'init') {
      return
    }

    // Skip other system noise
    const subtypesToSkip = ['init', 'permission_prompt', 'model_change']
    if (subtypesToSkip.includes(msg.subtype as string)) {
      return
    }

    const webMessage: WebChatMessage = {
      id: randomUUID(),
      role: 'system',
      content: `System: ${JSON.stringify(msg)}`,
      timestamp: new Date().toISOString(),
    }

    session.messages.push(webMessage)
    this.callbacks.onMessage(session.id, webMessage)
  }

  /**
   * Handle control request (permission request)
   */
  private handleControlRequest(session: InternalSession, msg: Record<string, unknown>): void {
    const requestId = msg.request_id as string
    const request = msg.request as Record<string, unknown>

    if (request.subtype !== 'can_use_tool') {
      // Respond to non-permission requests
      this.sendControlResponse(session, requestId, { subtype: 'success' })
      return
    }

    const pending: PendingPermissionRequest = {
      requestId,
      toolName: request.tool_name as string,
      toolInput: request.input as Record<string, unknown>,
      toolUseId: request.tool_use_id as string,
      description: request.description as string | undefined,
      title: request.title as string | undefined,
      timestamp: new Date(),
    }

    session.pendingRequests.set(requestId, pending)
    session.pendingPermissionRequest = pending

    this.callbacks.onPermissionRequest(session.id, pending)
  }

  /**
   * Handle stream event
   */
  private handleStreamEvent(session: InternalSession, msg: Record<string, unknown>): void {
    const event = msg.event as Record<string, unknown> | undefined
    if (!event) return

    const eventType = event.type as string

    switch (eventType) {
      case 'content_block_start': {
        const block = event.content_block as Record<string, unknown> | undefined
        const index = event.index as number

        if (block?.type === 'text') {
          // Start a new streaming text message
          const messageId = randomUUID()
          session.currentStreamingMessageId = messageId

          const webMessage: WebChatMessage = {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
            status: 'streaming',
          }

          session.messages.push(webMessage)
          this.callbacks.onMessage(session.id, webMessage)
        } else if (block?.type === 'tool_use') {
          // Tool use started
          const toolName = block.name as string
          const toolId = block.id as string

          // Create or update the message
          let message = session.messages.find(m => m.id === session.currentStreamingMessageId)
          if (!message) {
            const messageId = randomUUID()
            session.currentStreamingMessageId = messageId
            message = {
              id: messageId,
              role: 'assistant',
              content: [],
              timestamp: new Date().toISOString(),
              status: 'streaming',
            }
            session.messages.push(message)
            this.callbacks.onMessage(session.id, message)
          }

          // Add tool use block
          if (Array.isArray(message.content)) {
            message.content.push({
              type: 'tool_use',
              name: toolName,
              input: {},
              id: toolId,
            })
          }

          this.callbacks.onToolUse(session.id, message.id, toolName, {})
        }
        break
      }

      case 'content_block_delta': {
        const index = event.index as number
        const delta = event.delta as Record<string, unknown> | undefined

        if (delta?.type === 'text_delta') {
          const text = delta.text as string

          // Find the current streaming message
          const message = session.messages.find(m => m.id === session.currentStreamingMessageId)
          if (message && typeof message.content === 'string') {
            message.content += text
            this.callbacks.onStreamDelta(session.id, message.id, text)
          }
        } else if (delta?.type === 'input_json_delta') {
          // Tool input streaming - accumulate partial JSON
          const partialJson = delta.partial_json as string
          this.log(`[${session.id}] Tool input delta: ${partialJson?.substring(0, 50)}...`)
        } else if (delta?.type === 'thinking_delta') {
          const thinking = delta.thinking as string
          if (session.currentStreamingMessageId) {
            this.callbacks.onThinking(session.id, session.currentStreamingMessageId, thinking)
          }
        }
        break
      }

      case 'content_block_stop': {
        const index = event.index as number

        // Mark the message as complete if this was the last block
        const message = session.messages.find(m => m.id === session.currentStreamingMessageId)
        if (message) {
          message.status = 'complete'
          this.callbacks.onMessageUpdate(session.id, message)
        }
        break
      }

      case 'message_start': {
        const messageData = event.message as Record<string, unknown> | undefined
        this.log(`[${session.id}] Message start: ${JSON.stringify(messageData?.id)}`)
        break
      }

      case 'message_delta': {
        const usage = event.usage as Record<string, unknown> | undefined
        const deltaRecord = event.delta as Record<string, unknown> | undefined
        const stopReason = deltaRecord?.stop_reason as string | undefined

        if (stopReason) {
          this.log(`[${session.id}] Message complete: ${stopReason}`)
          session.currentStreamingMessageId = null
        }
        break
      }

      case 'message_stop': {
        this.log(`[${session.id}] Message stopped`)
        session.currentStreamingMessageId = null
        break
      }

      default:
        this.log(`[${session.id}] Stream event: ${eventType}`)
    }
  }

  /**
   * Send a message to Claude Code
   */
  sendMessage(sessionId: string, content: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session?.runner) {
      return false
    }

    session.lastActivityAt = new Date()

    // Add user message to history
    const userMessage: WebChatMessage = {
      id: randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    session.messages.push(userMessage)
    this.callbacks.onMessage(sessionId, userMessage)

    this.log(`[${sessionId}] >>> ${JSON.stringify({ type: 'user', content }).slice(0, 200)}...`)
    void session.runner.sendMessage(content)

    return true
  }

  /**
   * Respond to a permission request
   */
  respondToPermission(
    sessionId: string,
    requestId: string,
    approved: boolean,
    message?: string
  ): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const pending = session.pendingRequests.get(requestId)
    if (!pending) return

    session.pendingRequests.delete(requestId)
    if (session.pendingPermissionRequest?.requestId === requestId) {
      session.pendingPermissionRequest = undefined
    }

    session.runner?.respondToPermission(
      requestId,
      approved,
      pending.toolInput,
      message,
    )
  }

  private handlePermissionRequestFromRunner(
    session: InternalSession,
    requestId: string,
    request: PermissionRequestLike,
  ): void {
    const pending: PendingPermissionRequest = {
      requestId,
      toolName: request.tool_name,
      toolInput: request.input,
      toolUseId: request.tool_use_id,
      description: request.description,
      title: request.title,
      timestamp: new Date(),
    }

    session.pendingRequests.set(requestId, pending)
    session.pendingPermissionRequest = pending

    this.callbacks.onPermissionRequest(session.id, pending)
  }

  /**
   * Send control response to Claude Code
   */
  private sendControlResponse(
    session: InternalSession,
    requestId: string,
    response: Record<string, unknown>
  ): void {
    if (!session.process?.stdin) return

    const message = JSON.stringify({
      type: 'control_response',
      response: {
        ...response,
        request_id: requestId,
      },
    })

    this.log(`[${session.id}] >>> control_response: ${message.slice(0, 200)}...`)
    session.process.stdin.write(message + '\n')
  }

  private handleSdkMessage(session: InternalSession, message: SDKMessageLike): void {
    session.lastActivityAt = new Date()

    switch (message.type) {
      case 'assistant':
        this.handleAssistantMessage(
          session,
          message as unknown as Record<string, unknown>,
        )
        break

      case 'result':
        this.handleResultMessage(
          session,
          message as unknown as Record<string, unknown>,
        )
        break

      case 'system':
        this.handleSystemMessage(
          session,
          message as unknown as Record<string, unknown>,
        )
        break

      case 'stream_event':
        this.handleStreamEvent(
          session,
          message as unknown as Record<string, unknown>,
        )
        break
    }
  }

  /**
   * Send interrupt signal
   */
  sendInterrupt(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.runner) {
      session.runner.interrupt()
      return
    }

    if (!session.process?.stdin) return

    const message = JSON.stringify({
      type: 'control_request',
      request_id: randomUUID(),
      request: { subtype: 'interrupt' },
    })

    session.process.stdin.write(message + '\n')
  }

  /**
   * Close a session
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.runner) {
      void session.runner.close()
      session.runner = null
    }

    if (session.process) {
      session.process.kill('SIGTERM')
      session.process = null
    }

    this.sessions.delete(sessionId)
    this.callbacks.onStatusChange(sessionId, 'disconnected')
  }

  /**
   * Get all sessions
   */
  getSessions(): WebClientSession[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      claudeSessionId: s.claudeSessionId,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      status: s.status,
      messages: s.messages,
      pendingPermissionRequest: s.pendingPermissionRequest,
      workingDir: s.workingDir,
    }))
  }

  /**
   * Get a single session
   */
  getSession(sessionId: string): WebClientSession | undefined {
    const session = this.sessions.get(sessionId)
    if (!session) return undefined

    return {
      id: session.id,
      claudeSessionId: session.claudeSessionId,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      status: session.status,
      messages: session.messages,
      pendingPermissionRequest: session.pendingPermissionRequest,
      workingDir: session.workingDir,
    }
  }

  /**
   * Close all sessions
   */
  closeAll(): void {
    for (const session of this.sessions.values()) {
      this.closeSession(session.id)
    }
  }

  /**
   * Convert Claude API content to MessageContent
   */
  private convertContent(content: unknown): string | MessageContent[] {
    if (typeof content === 'string') {
      return content
    }

    if (!Array.isArray(content)) {
      return JSON.stringify(content)
    }

    // Filter out thinking blocks and convert to simple text if possible
    const filteredContent = content.filter((block): boolean => {
      if (typeof block === 'object' && block !== null) {
        const b = block as Record<string, unknown>
        // Skip thinking blocks - they're internal reasoning
        return b.type !== 'thinking'
      }
      return true
    })

    // If all content is text, concatenate into single string
    const allText = filteredContent.every((block): boolean => {
      if (typeof block === 'string') return true
      if (typeof block === 'object' && block !== null) {
        const b = block as Record<string, unknown>
        return b.type === 'text'
      }
      return false
    })

    if (allText && filteredContent.length > 0) {
      const text = filteredContent.map((block): string => {
        if (typeof block === 'string') return block
        return (block as Record<string, unknown>).text as string ?? ''
      }).join('')
      return text
    }

    return filteredContent.map((block): MessageContent => {
      if (typeof block === 'string') {
        return { type: 'text', text: block }
      }

      const b = block as Record<string, unknown>
      switch (b.type as string) {
        case 'text':
          return { type: 'text', text: (b.text as string) ?? '' }
        case 'tool_use':
          return {
            type: 'tool_use',
            name: (b.name as string) ?? 'unknown',
            input: (b.input as Record<string, unknown>) ?? {},
            id: b.id as string | undefined,
          }
        case 'tool_result':
          return {
            type: 'tool_result',
            tool_use_id: (b.tool_use_id as string) ?? '',
            content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
            is_error: b.is_error as boolean | undefined,
          }
        default:
          return { type: 'text', text: JSON.stringify(block) }
      }
    })
  }

  /**
   * Find the Claude CLI path
   * Priority: src/entrypoints/cli.tsx (real entry point) > cli.js (custom wrapper)
   * Note: cli.js is a custom wrapper for platform adapters, not the original CLI.
   * The actual Claude Code CLI entry point is src/entrypoints/cli.tsx.
   */
  private findCliPath(): string | null {
    // Try to find the CLI relative to the package installation
    const possiblePaths: string[] = []

    // Prefer the current workspace when it contains a local checkout.
    // WebChat sessions should operate against the user's project CLI first,
    // rather than a globally installed package entrypoint.
    const cwd = process.cwd()
    possiblePaths.push(
      cwd + '/cli.ts',
      cwd + '/cli.js',
      cwd + '/src/entrypoints/cli.tsx',
    )

    // First, try to find based on the package location
    // When installed globally, the structure is:
    // <prefix>/lib/node_modules/@openclaude-ai/myclaude-code/
    //   - cli.js (custom wrapper for platform adapters)
    //   - src/entrypoints/cli.tsx (real CLI entry point with print mode)
    //   - tsconfig.json (required for src/ path aliases)

    // Try import.meta.resolve to find the package root
    try {
      // @ts-ignore - require.resolve may not be recognized by TypeScript
      const packageJsonPath = require.resolve('@openclaude-ai/myclaude-code/package.json')
      if (packageJsonPath) {
        const packageDir = packageJsonPath.replace('/package.json', '')
        // Use the real entry point with print mode support
        possiblePaths.push(
          packageDir + '/src/entrypoints/cli.tsx',
          packageDir + '/cli.js',
        )
      }
    } catch {
      // Package not found via require.resolve
    }

    // Try to find based on the current module's location
    // In bundled mode, import.meta.dir points to the bundle location
    // We need to find the package root
    try {
      // Walk up from the current file to find package.json
      let currentDir = import.meta.dir
      for (let i = 0; i < 10 && currentDir !== '/'; i++) {
        const packageJsonPath = currentDir + '/package.json'
        if (existsSync(packageJsonPath)) {
          // Found the package root
          possiblePaths.push(
            currentDir + '/src/entrypoints/cli.tsx',
            currentDir + '/cli.js',
          )
          break
        }
        currentDir = currentDir.substring(0, currentDir.lastIndexOf('/'))
      }
    } catch {
      // Ignore errors
    }

    // Get the directory where the current script is located
    const scriptDir = import.meta.dir

    // Add paths relative to this file (works for both bundled and source)
    possiblePaths.push(
      // src/entrypoints/cli.tsx - real CLI entry point (has print mode)
      scriptDir + '/../../src/entrypoints/cli.tsx',
      // cli.js (custom wrapper for platform adapters)
      scriptDir + '/../../cli.js',
    )

    // Add global install locations
    // npm prefix can be found via `npm config get prefix`
    const npmPrefix = process.env.NODE_PREFIX || '/usr/local'
    possiblePaths.push(
      '/opt/homebrew/lib/node_modules/@openclaude-ai/myclaude-code/src/entrypoints/cli.tsx',
      '/opt/homebrew/lib/node_modules/@openclaude-ai/myclaude-code/cli.js',
      npmPrefix + '/lib/node_modules/@openclaude-ai/myclaude-code/src/entrypoints/cli.tsx',
      npmPrefix + '/lib/node_modules/@openclaude-ai/myclaude-code/cli.js',
      '/usr/local/lib/node_modules/@openclaude-ai/myclaude-code/src/entrypoints/cli.tsx',
      '/usr/local/lib/node_modules/@openclaude-ai/myclaude-code/cli.js',
      '/usr/lib/node_modules/@openclaude-ai/myclaude-code/src/entrypoints/cli.tsx',
      '/usr/lib/node_modules/@openclaude-ai/myclaude-code/cli.js',
    )

    for (const p of possiblePaths) {
      try {
        this.log(`Checking CLI path: ${p}`)
        if (existsSync(p)) {
          this.log(`Found CLI at: ${p}`)
          return p
        }
      } catch {
        // ignore
      }
    }

    return null
  }

  /**
   * Log message (if verbose)
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.error(`[WebChat] ${message}`)
    }
  }

  private shouldDisableClaudeAIMcpServers(): boolean {
    const configuredBaseUrl =
      this.readBaseUrlFromSettings(this.config.settingsPath) ??
      process.env.ANTHROPIC_BASE_URL

    if (!configuredBaseUrl) {
      return false
    }

    try {
      const host = new URL(configuredBaseUrl).host
      return !['api.anthropic.com', 'api-staging.anthropic.com'].includes(host)
    } catch {
      return false
    }
  }

  private readBaseUrlFromSettings(settingsPath?: string): string | undefined {
    if (!settingsPath || !existsSync(settingsPath)) {
      return undefined
    }

    try {
      const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
        env?: Record<string, string>
      }
      return raw.env?.ANTHROPIC_BASE_URL
    } catch (error) {
      this.log(
        `Failed to read settings from ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`,
      )
      return undefined
    }
  }
}
