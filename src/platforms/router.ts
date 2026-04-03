/**
 * Message Router - 消息路由器
 */

import type { UnifiedMessage, PlatformId } from './types.js'
import type { WebChatSessionManager } from '../webchat/sessionManager.js'

/**
 * 会话映射
 */
interface SessionMapping {
  sessionId: string
  platformId: PlatformId
  platformChatId: string
  lastActivity: Date
}

/**
 * 消息路由器
 * 负责将平台消息路由到正确的 Claude Session
 */
export class MessageRouter {
  private sessionManager: WebChatSessionManager
  private sessionMap = new Map<string, SessionMapping>()
  private responseCallbacks = new Map<string, (response: UnifiedMessage) => void>()

  constructor(sessionManager: WebChatSessionManager) {
    this.sessionManager = sessionManager
  }

  /**
   * 设置 Session Manager（延迟绑定）
   */
  setSessionManager(manager: WebChatSessionManager): void {
    this.sessionManager = manager
  }

  /**
   * 路由消息到对应 Session
   */
  async route(message: UnifiedMessage): Promise<string> {
    const mappingKey = `${message.platform}:${message.platformChatId}`
    let mapping = this.sessionMap.get(mappingKey)

    if (!mapping || !this.isSessionActive(mapping.sessionId)) {
      // 创建新会话
      const session = await this.sessionManager.createSession()
      mapping = {
        sessionId: session.id,
        platformId: message.platform,
        platformChatId: message.platformChatId,
        lastActivity: new Date(),
      }
      this.sessionMap.set(mappingKey, mapping)
      console.log(`[Router] New session created: ${session.id} for ${mappingKey}`)
    }

    // 发送消息到 Session
    const content = typeof message.content === 'string'
      ? message.content
      : message.content.map(c => c.type === 'text' ? c.text : '[附件]').join('')

    await this.sessionManager.sendMessage(mapping.sessionId, content)

    // 更新活动时间
    mapping.lastActivity = new Date()

    return mapping.sessionId
  }

  /**
   * 检查会话是否活跃
   */
  private isSessionActive(sessionId: string): boolean {
    const session = this.sessionManager.getSession(sessionId)
    return session?.status === 'connected'
  }

  /**
   * 获取会话映射
   */
  getSessionMapping(platform: PlatformId, chatId: string): SessionMapping | undefined {
    return this.sessionMap.get(`${platform}:${chatId}`)
  }

  /**
   * 通过 Session ID 获取会话映射
   */
  getSessionMappingBySessionId(sessionId: string): SessionMapping | undefined {
    for (const mapping of this.sessionMap.values()) {
      if (mapping.sessionId === sessionId) {
        return mapping
      }
    }
    return undefined
  }

  /**
   * 清理过期会话映射
   */
  cleanupExpired(timeoutMs: number = 30 * 60 * 1000): void {
    const now = new Date()
    let cleaned = 0
    for (const [key, mapping] of this.sessionMap) {
      if (now.getTime() - mapping.lastActivity.getTime() > timeoutMs) {
        this.sessionMap.delete(key)
        cleaned++
      }
    }
    if (cleaned > 0) {
      console.log(`[Router] Cleaned ${cleaned} expired session mappings`)
    }
  }

  /**
   * 获取所有活跃映射数量
   */
  getActiveMappingCount(): number {
    return this.sessionMap.size
  }
}

// 全局路由器实例（需要在启动时绑定 SessionManager）
export const messageRouter = new MessageRouter(null as any)
