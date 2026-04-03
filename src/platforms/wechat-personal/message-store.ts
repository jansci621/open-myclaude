/**
 * MessageStore — SQLite 消息持久化
 *
 * 为个人微信适配器提供消息去重、持久化、对话历史查询和失败重试。
 * 状态简化为：received → processing → replied / failed
 */

import fs from "node:fs"
import path from "node:path"
import { Database } from "bun:sqlite"

// ── 类型 ──────────────────────────────────────────────────────────────────

type MessageState = "received" | "processing" | "replied" | "failed"

export interface InboundMessage {
  messageId: string
  messageKey: string
  accountName: string
  senderId: string
  senderName: string
  text: string
  chatId: string
  contextToken: string | null
  receivedAt: number
  state: MessageState
  attemptCount: number
  replyText: string | null
  repliedAt: number | null
  lastError: string | null
}

export interface MessageStoreStatus {
  received: number
  processing: number
  replied: number
  failed: number
}

// ── 常量 ──────────────────────────────────────────────────────────────────

const DEFAULT_RUNTIME_DIR = path.join(
  process.env.HOME || "~",
  ".claude",
  "channels",
  "wechat-personal",
)

// ── MessageStore ──────────────────────────────────────────────────────────

export class MessageStore {
  private readonly db: Database

  constructor(runtimeDir?: string) {
    const dir = runtimeDir ?? DEFAULT_RUNTIME_DIR
    fs.mkdirSync(dir, { recursive: true })
    this.db = new Database(path.join(dir, "message-store.sqlite"))
    this.ensureSchema()
  }

  // ── 公开接口 ──────────────────────────────────────────────────────────

  /**
   * 持久化入站消息（自动去重）。
   * 返回 true 表示新消息，false 表示重复。
   */
  persistMessage = (params: {
    accountName: string
    senderId: string
    senderName: string
    chatId: string
    text: string
    rawMessageId: string
    contextToken?: string
  }): boolean => {
    const { accountName, senderId, senderName, chatId, text, rawMessageId, contextToken } =
      params
    const messageKey = `${accountName}:${rawMessageId}`
    const messageId = messageKey.replace(/[^a-zA-Z0-9:_-]/g, "_")
    const now = Date.now()

    const result = this.db
      .query(
        `INSERT OR IGNORE INTO inbound_messages (
          message_id, message_key, account_name, sender_id, sender_name,
          chat_id, text, context_token, received_at, state, attempt_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', 0)`,
      )
      .run(
        messageId,
        messageKey,
        accountName,
        senderId,
        senderName,
        chatId,
        text,
        contextToken ?? null,
        now,
      )

    return result.changes > 0
  }

  /**
   * 获取下一条待处理消息并标记为 processing。
   * 返回 null 表示没有待处理消息。
   */
  acquireNext = (): InboundMessage | null => {
    const row = this.db
      .query(
        `SELECT * FROM inbound_messages
         WHERE state = 'received'
         ORDER BY received_at ASC
         LIMIT 1`,
      )
      .get() as InboundMessageRow | null

    if (!row) return null

    this.db
      .query(
        `UPDATE inbound_messages
         SET state = 'processing', attempt_count = attempt_count + 1, last_error = NULL
         WHERE message_id = ? AND state = 'received'`,
      )
      .run(row.message_id)

    return this.rowToMessage(
      this.db
        .query("SELECT * FROM inbound_messages WHERE message_id = ?")
        .get(row.message_id) as InboundMessageRow,
    )
  }

  /**
   * 标记消息已回复。
   */
  markReplied = (messageId: string, replyText: string): void => {
    this.db
      .query(
        `UPDATE inbound_messages
         SET state = 'replied', reply_text = ?, replied_at = ?, last_error = NULL
         WHERE message_id = ?`,
      )
      .run(replyText, Date.now(), messageId)
  }

  /**
   * 标记消息处理失败，回退到 received 状态等待重试。
   */
  markFailed = (messageId: string, error: string): void => {
    this.db
      .query(
        `UPDATE inbound_messages
         SET state = 'received', last_error = ?
         WHERE message_id = ?`,
      )
      .run(error, messageId)
  }

  /**
   * 获取对话历史（最近 N 轮已回复的消息）。
   */
  getConversationHistory = (
    senderId: string,
    limit = 6,
  ): Array<{ text: string; replyText: string }> => {
    const rows = this.db
      .query(
        `SELECT text, reply_text
         FROM inbound_messages
         WHERE sender_id = ? AND state = 'replied'
         ORDER BY received_at DESC
         LIMIT ?`,
      )
      .all(senderId, limit) as Array<{ text: string; reply_text: string | null }>

    return rows.reverse().map((r) => ({
      text: r.text,
      replyText: r.reply_text ?? "",
    }))
  }

  /**
   * 根据账号名和原始消息 ID 计算内部 messageId。
   */
  getMessageId = (accountName: string, rawMessageId: string): string => {
    const messageKey = `${accountName}:${rawMessageId}`
    return messageKey.replace(/[^a-zA-Z0-9:_-]/g, "_")
  }

  /**
   * 获取消息的 context_token（用于 iLink 协议回复）。
   */
  getContextToken = (messageId: string): string | null => {
    const row = this.db
      .query("SELECT context_token FROM inbound_messages WHERE message_id = ?")
      .get(messageId) as { context_token: string | null } | null
    return row?.context_token ?? null
  }

  /**
   * 根据 chatId 获取最近的 context_token。
   */
  getRecentContextToken = (chatId: string): string | null => {
    const row = this.db
      .query(
        `SELECT context_token FROM inbound_messages
         WHERE chat_id = ? AND context_token IS NOT NULL
         ORDER BY received_at DESC
         LIMIT 1`,
      )
      .get(chatId) as { context_token: string | null } | null
    return row?.context_token ?? null
  }

  /**
   * 检查消息是否已存在（用于外部去重判断）。
   */
  exists = (accountName: string, rawMessageId: string): boolean => {
    const messageKey = `${accountName}:${rawMessageId}`
    const row = this.db
      .query("SELECT 1 FROM inbound_messages WHERE message_key = ?")
      .get(messageKey)
    return row !== null
  }

  /**
   * 获取消息状态统计。
   */
  getStatus = (): MessageStoreStatus => {
    const counts: MessageStoreStatus = {
      received: 0,
      processing: 0,
      replied: 0,
      failed: 0,
    }
    const rows = this.db
      .query(
        "SELECT state, COUNT(*) AS count FROM inbound_messages GROUP BY state",
      )
      .all() as Array<{ state: string; count: number }>

    for (const row of rows) {
      if (row.state in counts) {
        (counts as any)[row.state] = row.count
      }
    }
    return counts
  }

  /**
   * 获取待处理消息数量。
   */
  getPendingCount = (): number => {
    const row = this.db
      .query(
        "SELECT COUNT(*) AS count FROM inbound_messages WHERE state = 'received'",
      )
      .get() as { count: number }
    return row.count
  }

  close = (): void => {
    this.db.close()
  }

  // ── 内部 ──────────────────────────────────────────────────────────────

  private ensureSchema = (): void => {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inbound_messages (
        message_id TEXT PRIMARY KEY,
        message_key TEXT NOT NULL UNIQUE,
        account_name TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        text TEXT NOT NULL,
        context_token TEXT,
        received_at INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'received',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        reply_text TEXT,
        replied_at INTEGER,
        last_error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_msg_state
        ON inbound_messages (state, received_at);

      CREATE INDEX IF NOT EXISTS idx_msg_sender
        ON inbound_messages (sender_id, received_at);
    `)

    // 迁移：为已有表添加 context_token 列（如果不存在）
    try {
      this.db.exec(`ALTER TABLE inbound_messages ADD COLUMN context_token TEXT`)
    } catch {
      // 列已存在，忽略
    }
  }

  private rowToMessage = (row: InboundMessageRow): InboundMessage => ({
    messageId: row.message_id,
    messageKey: row.message_key,
    accountName: row.account_name,
    senderId: row.sender_id,
    senderName: row.sender_name,
    text: row.text,
    chatId: row.chat_id,
    contextToken: row.context_token,
    receivedAt: row.received_at,
    state: row.state,
    attemptCount: row.attempt_count,
    replyText: row.reply_text,
    repliedAt: row.replied_at,
    lastError: row.last_error,
  })
}

// ── 内部行类型 ────────────────────────────────────────────────────────────

interface InboundMessageRow {
  message_id: string
  message_key: string
  account_name: string
  sender_id: string
  sender_name: string
  chat_id: string
  text: string
  context_token: string | null
  received_at: number
  state: MessageState
  attempt_count: number
  reply_text: string | null
  replied_at: number | null
  last_error: string | null
}
