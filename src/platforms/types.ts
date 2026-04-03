/**
 * Platform Types - 多平台插件系统类型定义
 */

/**
 * 平台标识
 */
export type PlatformId = 'webchat' | 'feishu' | 'wechat' | 'wecom' | 'dingtalk' | 'wechat-personal'

/**
 * 统一消息格式 - 内部使用
 */
export type UnifiedMessage = {
  id: string
  platform: PlatformId
  platformMessageId: string
  platformUserId: string
  platformChatId: string
  sessionId?: string
  content: string | UnifiedContent[]
  messageType: 'text' | 'image' | 'file' | 'audio' | 'video' | 'event'
  timestamp: Date
  replyTo?: string
  raw: unknown
}

/**
 * 统一内容格式
 */
export type UnifiedContent =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; fileId?: string }
  | { type: 'file'; name: string; url: string; size?: number }
  | { type: 'audio'; url: string; duration?: number }

/**
 * 统一响应格式
 */
export type UnifiedResponse = {
  content: string | UnifiedContent[]
  replyTo?: string
  attachments?: Attachment[]
}

/**
 * 平台配置
 */
export type PlatformConfig = {
  enabled: boolean
  path: string
  appId?: string
  appSecret?: string
  token?: string
  features: {
    streaming: boolean
    richText: boolean
    file: boolean
    mention: boolean
  }
  session: {
    createOnMessage: boolean
    timeout: number
    maxPerUser: number
  }
}

/**
 * 平台适配器接口
 */
export interface IPlatformAdapter {
  readonly platformId: PlatformId
  readonly platformName: string
  config: PlatformConfig

  initialize(): Promise<void>
  validateSignature(req: Request): Promise<boolean>
  handleWebhook(req: Request): Promise<Response>
  normalizeMessage(rawMessage: unknown): Promise<UnifiedMessage>
  sendResponse(chatId: string, response: UnifiedResponse): Promise<void>
  stop(): Promise<void>
}

/**
 * 平台用户信息
 */
export type PlatformUserInfo = {
  id: string
  name: string
  avatar?: string
  email?: string
  extra?: Record<string, unknown>
}

/**
 * 附件
 */
export type Attachment = {
  type: 'image' | 'file' | 'audio' | 'video'
  name: string
  url?: string
  data?: Buffer
  mimeType?: string
  size?: number
}

/**
 * 多平台服务配置
 */
export type MultiPlatformConfig = {
  port: number
  host: string
  platforms: Partial<Record<PlatformId, PlatformConfig>>
}
