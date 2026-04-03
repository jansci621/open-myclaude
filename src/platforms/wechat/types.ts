/**
 * WeCom (企业微信) Platform Types
 */

/**
 * 企业微信回调消息
 */
export type WeComCallbackMessage = {
  ToUserName: string
  FromUserName: string
  CreateTime: number
  MsgType: 'text' | 'image' | 'voice' | 'video' | 'file' | 'event'
  Content?: string
  PicUrl?: string
  MediaId?: string
  Event?: string
  EventKey?: string
  MsgId: string
  AgentID: string
}

/**
 * 企业微信加密消息
 */
export type WeComEncryptedMessage = {
  ToUserName: string
  Encrypt: string
}

/**
 * 企业微信消息响应
 */
export type WeComMessageResponse = {
  touser: string
  msgtype: string
  text?: { content: string }
  image?: { media_id: string }
  markdown?: { content: string }
  agentid?: string
}

/**
 * 企业微信 Access Token 响应
 */
export type WeComTokenResponse = {
  errcode: number
  errmsg: string
  access_token: string
  expires_in: number
}

/**
 * 企业微信发送消息响应
 */
export type WeComSendMessageResponse = {
  errcode: number
  errmsg: string
  msgid?: string
}
