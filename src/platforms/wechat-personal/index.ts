/**
 * Personal WeChat Module
 */

export { WeChatPersonalAdapter } from './adapter.js'
export type { WeChatPersonalConfig, WeChatPersonalConfig as Config } from './types.js'
export { DEFAULT_WECHAT_PERSONAL_CONFIG } from './types.js'

// Protocol exports
export type { IWeChatProtocol, WeChatContact, WeChatRoom, WeChatRawMessage, WeChatMessageType } from './protocols/protocol.js'
export { ILinkProtocol } from './protocols/ilink.js'
