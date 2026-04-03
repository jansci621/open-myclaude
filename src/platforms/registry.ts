/**
 * Platform Registry - 平台插件注册中心
 */

import type { IPlatformAdapter, PlatformId } from './types.js'

/**
 * 平台插件注册中心
 */
export class PlatformRegistry {
  private adapters = new Map<PlatformId, IPlatformAdapter>()

  /**
   * 注册平台适配器
   */
  async register(adapter: IPlatformAdapter): Promise<void> {
    await adapter.initialize()
    this.adapters.set(adapter.platformId, adapter)
    console.log(`[Platform] Registered: ${adapter.platformName}`)
  }

  /**
   * 获取适配器
   */
  get(platformId: PlatformId): IPlatformAdapter | undefined {
    return this.adapters.get(platformId)
  }

  /**
   * 获取所有适配器
   */
  getAll(): IPlatformAdapter[] {
    return Array.from(this.adapters.values())
  }

  /**
   * 获取启用的适配器
   */
  getEnabled(): IPlatformAdapter[] {
    return this.getAll().filter(a => a.config.enabled)
  }

  /**
   * 停止所有适配器
   */
  async stopAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.stop()
    }
    this.adapters.clear()
  }
}

// 全局注册中心实例
export const platformRegistry = new PlatformRegistry()
