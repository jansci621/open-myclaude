/**
 * Feishu Platform Types
 */

/**
 * 飞书事件消息
 */
export type FeishuEvent = {
  schema: '2.0'
  header: {
    event_id: string
    event_type: string
    create_time: string
    token: string
    app_id: string
    tenant_key: string
  }
  event: FeishuMessageEvent | Record<string, unknown>
}

/**
 * 飞书消息事件
 */
export type FeishuMessageEvent = {
  sender: {
    sender_id: {
      open_id: string
      union_id: string
      user_id: string
    }
    sender_type: string
    tenant_key: string
  }
  message: {
    message_id: string
    root_id?: string
    parent_id?: string
    create_time: string
    chat_id: string
    message_type: 'text' | 'post' | 'image' | 'file' | 'audio'
    content: string
    mentions?: FeishuMention[]
  }
}

/**
 * @提及信息
 */
export type FeishuMention = {
  key: string
  id: {
    open_id: string
    user_id: string
  }
  name: string
  tenant_key: string
}

/**
 * 飞书文本消息内容
 */
export type FeishuTextContent = {
  text: string
}

/**
 * 飞书富文本消息内容
 */
export type FeishuPostContent = {
  zh_cn?: {
    title: string
    content: FeishuPostSection[][]
  }
}

export type FeishuPostSection =
  | { tag: 'text'; text: string }
  | { tag: 'a'; text: string; href: string }
  | { tag: 'at'; user_id: string }
  | { tag: 'img'; image_key: string }

/**
 * 飞书 URL 验证请求
 */
export type FeishuUrlVerification = {
  type: 'url_verification'
  challenge: string
  token: string
}

/**
 * 飞书 Access Token 响应
 */
export type FeishuTokenResponse = {
  code: number
  msg: string
  tenant_access_token: string
  expire: number
}

/**
 * 飞书发送消息响应
 */
export type FeishuSendMessageResponse = {
  code: number
  msg: string
  data?: {
    message_id: string
  }
}

/**
 * 飞书 WebSocket 网关响应
 */
export type FeishuWsGatewayResponse = {
  code: number
  msg: string
  data?: {
    gateway: string
    expire: number
  }
}

/**
 * 飞书 WebSocket 消息类型
 */
export type FeishuWsMessage =
  | { type: 'pong' }
  | { type: 'event'; payload: FeishuEvent }
  | { type: 'error'; payload: { code: number; msg: string } }

/**
 * 飞书 WebSocket 配置
 */
export type FeishuWsConfig = {
  enabled: boolean
  reconnect: boolean
  reconnectInterval: number
  heartbeatInterval: number
}
