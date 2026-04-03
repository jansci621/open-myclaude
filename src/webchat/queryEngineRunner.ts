import { ask } from '../QueryEngine.js'
import { setFlagSettingsPath } from '../bootstrap/state.js'
import { getCommands, type Command } from '../commands.js'
import { getCanUseToolFn } from '../cli/print.js'
import { StructuredIO } from '../cli/structuredIO.js'
import { getMcpToolsCommandsAndResources } from '../services/mcp/client.js'
import type { Tool } from '../Tool.js'
import type { MCPServerConnection, ServerResource } from '../services/mcp/types.js'
import { getDefaultAppState, type AppState } from '../state/AppStateStore.js'
import { onChangeAppState } from '../state/onChangeAppState.js'
import { createStore, type Store } from '../state/store.js'
import { assembleToolPool } from '../tools.js'
import { enableConfigs } from '../utils/config.js'
import { existsSync, readFileSync } from 'fs'
import {
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
  type FileStateCache,
} from '../utils/fileStateCache.js'
import { logError } from '../utils/log.js'
import { processSessionStartHooks, processSetupHooks } from '../utils/sessionStart.js'
import type { WebChatConfig } from './types.js'

type SDKMessageLike = { type: string; [key: string]: unknown }
type PermissionRequestLike = {
  subtype: 'can_use_tool'
  tool_name: string
  input: Record<string, unknown>
  tool_use_id: string
  description?: string
  title?: string
}
type ControlResponseLike = {
  type: 'control_response'
  response: {
    subtype: 'success'
    request_id: string
    response:
      | { behavior: 'allow'; updatedInput: Record<string, unknown> }
      | { behavior: 'deny'; message: string }
  }
}

type QueryEngineRunnerCallbacks = {
  onSdkMessage: (message: SDKMessageLike) => void
  onPermissionRequest: (
    requestId: string,
    request: PermissionRequestLike,
  ) => void
  onError: (error: Error) => void
}

async function* emptyInput(): AsyncGenerator<string, void, unknown> {}

export class QueryEngineWebChatRunner {
  private readonly store: Store<AppState>
  private readonly structuredIO = new StructuredIO(emptyInput())
  private readonly mutableMessages: unknown[] = []
  private readonly callbacks: QueryEngineRunnerCallbacks
  private readonly config: WebChatConfig
  private readonly workingDir: string
  private readonly sessionId: string

  private commands: Command[] = []
  private readFileState: FileStateCache = createFileStateCacheWithSizeLimit(
    READ_FILE_STATE_CACHE_SIZE,
  )
  private mcpClients: MCPServerConnection[] = []
  private initialized = false
  private disposed = false
  private currentAbortController: AbortController | null = null
  private runQueue: Promise<void> = Promise.resolve()

  constructor(params: {
    config: WebChatConfig
    workingDir: string
    sessionId: string
    callbacks: QueryEngineRunnerCallbacks
  }) {
    this.config = params.config
    this.workingDir = params.workingDir
    this.sessionId = params.sessionId
    this.callbacks = params.callbacks

    enableConfigs()
    this.store = createStore(getDefaultAppState(), onChangeAppState)

    if (this.config.settingsPath) {
      setFlagSettingsPath(this.config.settingsPath)
    }
    if (this.shouldDisableClaudeAIMcpServers()) {
      process.env.ENABLE_CLAUDEAI_MCP_SERVERS = 'false'
    }

    this.store.setState(prev => ({
      ...prev,
      verbose: this.config.verbose,
    }))

    this.structuredIO.setOnControlRequestSent(request => {
      if (request.request.subtype === 'can_use_tool') {
        this.callbacks.onPermissionRequest(request.request_id, request.request)
      }
    })
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      await processSetupHooks('init').catch(error => {
        logError(error)
      })

      const sessionStartMessages = await processSessionStartHooks('startup', {
        sessionId: this.sessionId,
      }).catch(error => {
        logError(error)
        return []
      })
      this.mutableMessages.push(...sessionStartMessages)

      this.commands = await getCommands(this.workingDir)
      await this.initializeMcpState()
      this.initialized = true
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  sendMessage(prompt: string): Promise<void> {
    this.runQueue = this.runQueue
      .then(() => this.runTurn(prompt))
      .catch(error => {
        this.callbacks.onError(
          error instanceof Error ? error : new Error(String(error)),
        )
      })
    return this.runQueue
  }

  interrupt(): void {
    this.currentAbortController?.abort()
  }

  respondToPermission(
    requestId: string,
    approved: boolean,
    updatedInput: Record<string, unknown>,
    message?: string,
  ): void {
    const response: ControlResponseLike = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: approved
          ? {
              behavior: 'allow',
              updatedInput,
            }
          : {
              behavior: 'deny',
              message: message ?? 'Denied by user',
            },
      },
    }
    this.structuredIO.injectControlResponse(response)
  }

  async close(): Promise<void> {
    this.disposed = true
    this.currentAbortController?.abort()
    await this.runQueue.catch(() => {})

    await Promise.allSettled(
      this.mcpClients
        .filter(
          (client): client is Extract<MCPServerConnection, { type: 'connected' }> =>
            client.type === 'connected',
        )
        .map(client => client.cleanup()),
    )
  }

  private async initializeMcpState(): Promise<void> {
    const clients: MCPServerConnection[] = []
    const tools: Tool[] = []
    const commands: Command[] = []
    const resources: Record<string, ServerResource[]> = {}

    await getMcpToolsCommandsAndResources(result => {
      clients.push(result.client)
      tools.push(...result.tools)
      commands.push(...result.commands)
      if (result.resources && result.resources.length > 0) {
        resources[result.client.name] = result.resources
      }
    }).catch(error => {
      logError(error)
    })

    this.mcpClients = clients
    this.store.setState(prev => ({
      ...prev,
      mcp: {
        ...prev.mcp,
        clients,
        tools,
        commands,
        resources,
      },
    }))
  }

  private async runTurn(prompt: string): Promise<void> {
    if (this.disposed) {
      return
    }

    await this.init()

    const abortController = new AbortController()
    this.currentAbortController = abortController

    const canUseTool =
      this.config.permissionMode === 'auto-approve'
        ? async (
            _tool: unknown,
            input: Record<string, unknown>,
            _context: unknown,
            _assistantMessage: unknown,
            toolUseID: string,
          ) => ({
            behavior: 'allow' as const,
            updatedInput: input,
            toolUseID,
            decisionReason: { type: 'other' as const, reason: 'auto-approved' },
          })
        : this.config.permissionMode === 'auto-deny'
          ? async (
              _tool: unknown,
              _input: Record<string, unknown>,
              _context: unknown,
              _assistantMessage: unknown,
              toolUseID: string,
            ) => ({
              behavior: 'deny' as const,
              message: 'Denied by WebChat auto-deny mode',
              toolUseID,
              decisionReason: { type: 'other' as const, reason: 'auto-deny' },
            })
          : getCanUseToolFn(
              'stdio',
              this.structuredIO,
              () => this.store.getState().mcp.tools,
            )

    try {
      for await (const message of ask({
        commands: [...this.commands, ...this.store.getState().mcp.commands],
        prompt,
        cwd: this.workingDir,
        tools: assembleToolPool(
          this.store.getState().toolPermissionContext,
          this.store.getState().mcp.tools,
        ),
        mcpClients: this.mcpClients,
        canUseTool: canUseTool as never,
        mutableMessages: this.mutableMessages as never,
        getReadFileCache: () => this.readFileState,
        setReadFileCache: cache => {
          this.readFileState = cache
        },
        getAppState: this.store.getState,
        setAppState: this.store.setState,
        abortController,
        verbose: this.config.verbose,
        handleElicitation: async () => ({ action: 'cancel' }),
      })) {
        this.callbacks.onSdkMessage(message)
      }
    } finally {
      if (this.currentAbortController === abortController) {
        this.currentAbortController = null
      }
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
    } catch {
      return undefined
    }
  }
}
