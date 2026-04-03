/**
 * Platform Adapter Base Class
 */

import type { IPlatformAdapter, PlatformConfig, UnifiedMessage, UnifiedResponse } from './types.js'

/**
 * 平台适配器基类
 */
export abstract class BasePlatformAdapter implements IPlatformAdapter {
  abstract readonly platformId: import('./types.js').PlatformId
  abstract readonly platformName: string

  constructor(public config: PlatformConfig) {}

  async initialize(): Promise<void> {
    this.validateConfig()
  }

  protected validateConfig(): void {
    if (!this.config.appId && this.requiresAppId) {
      throw new Error(`${this.platformName}: appId is required`)
    }
    if (!this.config.appSecret && this.requiresAppSecret) {
      throw new Error(`${this.platformName}: appSecret is required`)
    }
  }

  protected get requiresAppId(): boolean {
    return true
  }

  protected get requiresAppSecret(): boolean {
    return true
  }

  abstract validateSignature(req: Request): Promise<boolean>
  abstract handleWebhook(req: Request): Promise<Response>
  abstract normalizeMessage(rawMessage: unknown): Promise<UnifiedMessage>
  abstract sendResponse(chatId: string, response: UnifiedResponse): Promise<void>

  async stop(): Promise<void> {
    // 默认空实现
  }
}
