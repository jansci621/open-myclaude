/**
 * Personal WeChat Protocol Types
 */

/**
 * 个人微信协议接口
 */
export interface IWeChatProtocol {
  /** 协议名称 */
  readonly name: string

  /** 协议类型 */
  readonly type: 'ilink'

  /**
   * 初始化协议
   */
  initialize(): Promise<void>

  /**
   * 启动并等待登录
   */
  start(): Promise<boolean>

  /**
   * 停止协议
   */
  stop(): Promise<void>

  /**
   * 是否已登录
   */
  isLoggedIn(): boolean

  /**
   * 获取登录二维码
   */
  getQRCode(): Promise<string | Buffer | null>

  /**
   * 发送文本消息
   */
  sendText(contactId: string, text: string): Promise<string>

  /**
   * 发送图片
   */
  sendImage(contactId: string, image: Buffer | string): Promise<string>

  /**
   * 发送文件
   */
  sendFile(contactId: string, file: Buffer | string, name: string): Promise<string>

  /**
   * 获取联系人信息
   */
  getContact(contactId: string): Promise<WeChatContact>

  /**
   * 获取群聊信息
   */
  getRoom(roomId: string): Promise<WeChatRoom>

  /**
   * 消息回调注册
   */
  onMessage(callback: (message: WeChatRawMessage) => void): void

  /**
   * 登录回调注册
   */
  onLogin(callback: (user: WeChatContact) => void): void

  /**
   * 登出回调注册
   */
  onLogout(callback: (reason: string) => void): void
}

/**
 * 微信联系人
 */
export type WeChatContact = {
  id: string
  name: string
  alias?: string
  avatar?: string
  gender?: 'male' | 'female' | 'unknown'
  city?: string
  province?: string
  signature?: string
  isFriend: boolean
  isBot: boolean
}

/**
 * 微信群聊
 */
export type WeChatRoom = {
  id: string
  name: string
  avatar?: string
  members: WeChatContact[]
  ownerId: string
}

/**
 * 微信原始消息
 */
export type WeChatRawMessage = {
  id: string
  type: WeChatMessageType
  fromId: string
  toId: string
  roomId?: string
  content: string
  timestamp: Date
  mentionIds?: string[]

  // 附件信息
  file?: {
    name: string
    size: number
    data?: Buffer
  }

  // 图片信息
  image?: {
    url?: string
    data?: Buffer
  }

  // 协议特定元数据（如 iLink context_token）
  metadata?: Record<string, string>
}

/**
 * 消息类型
 */
export type WeChatMessageType =
  | 'text'
  | 'image'
  | 'voice'
  | 'video'
  | 'file'
  | 'emoji'
  | 'location'
  | 'link'
  | 'mini_program'
  | 'transfer'
  | 'red_packet'
  | 'system'
  | 'unknown'
