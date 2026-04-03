/**
 * Personal WeChat Types
 */

import type { PlatformConfig } from '../types.js'

/**
 * 个人微信配置
 */
export type WeChatPersonalConfig = PlatformConfig & {
  /** 协议类型（默认 ilink） */
  protocol: 'ilink'

  /** iLink API 地址（默认 https://ilinkai.weixin.qq.com） */
  ilinkBaseUrl?: string

  /** iLink 账号名称（默认 default） */
  ilinkAccountName?: string

  /** 自动登录 */
  autoLogin: boolean

  /** 登录超时（秒） */
  loginTimeout: number

  /** 重连配置 */
  reconnect: {
    enabled: boolean
    maxRetries: number
    interval: number
  }

  /** 消息过滤 */
  filter: {
    /** 允许的用户列表（为空则允许所有） */
    allowedUsers?: string[]
    /** 允许的群列表 */
    allowedRooms?: string[]
    /** 是否忽略群消息 */
    ignoreRooms: boolean
    /** 是否忽略公众号 */
    ignoreOfficial: boolean
  }

  /** 自动回复配置 */
  autoReply: {
    /** 是否启用自动回复 */
    enabled: boolean
    /** Claude 工作目录 */
    workspaceDir?: string
    /** Claude 设置源（默认 user） */
    settingSources?: string
    /** 单条消息最大字符数（默认 8000） */
    maxMessageChars?: number
    /** 对话历史最大字符数（默认 16000） */
    maxHistoryChars?: number
    /** 最大历史轮数（默认 6） */
    maxHistoryTurns?: number
    /** 单次处理超时毫秒（默认 120000） */
    timeoutMs?: number
    /** 重试基础延迟毫秒（默认 5000） */
    retryBaseMs?: number
    /** 重试最大延迟毫秒（默认 300000） */
    retryMaxMs?: number
  }
}

/**
 * 默认配置
 */
export const DEFAULT_WECHAT_PERSONAL_CONFIG: Partial<WeChatPersonalConfig> = {
  protocol: 'ilink',
  autoLogin: true,
  loginTimeout: 300,
  reconnect: {
    enabled: true,
    maxRetries: 10,
    interval: 5000,
  },
  filter: {
    ignoreRooms: false,
    ignoreOfficial: true,
  },
  autoReply: {
    enabled: true,
    settingSources: 'user',
    maxMessageChars: 8000,
    maxHistoryChars: 16000,
    maxHistoryTurns: 6,
    timeoutMs: 120_000,
    retryBaseMs: 5000,
    retryMaxMs: 300_000,
  },
}
