/**
 * Platforms Module - Export
 */

export * from './types.js'
export * from './adapter.js'
export * from './registry.js'
export * from './router.js'
export * from './server.js'

// Platform adapters
export { FeishuAdapter } from './feishu/adapter.js'
export { WeComAdapter } from './wechat/adapter.js'
export { WeChatPersonalAdapter } from './wechat-personal/adapter.js'
