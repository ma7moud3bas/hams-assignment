// Wire types, copied from the assessment's protocol description.

export type Role = 'customer' | 'ai' | 'human'
export type Status = 'ai' | 'needs_human' | 'human' | 'closed'

export interface Message {
  id: string
  conversationId: string
  role: Role
  text: string
  createdAt: string
  streaming?: true // an AI reply that is still being written
  clientMessageId?: string // echoed back from our POST
}

export interface Conversation {
  id: string
  customer: string
  status: Status
  lastMessage: string
  unread: number
  updatedAt: string
}

export type StreamEvent =
  | { id: number; type: 'message'; conversationId: string; message: Message }
  | { id: number; type: 'message_start'; conversationId: string; messageId: string; role: 'ai' }
  | { id: number; type: 'token'; conversationId: string; messageId: string; text: string }
  | { id: number; type: 'message_end'; conversationId: string; messageId: string }
  | { id: number; type: 'tool_call'; conversationId: string; name: 'transfer_to_human'; args: { reason: string } }
  | { id: number; type: 'status'; conversationId: string; status: Status }

/** `lastEventId` is the last stream event the snapshot already includes. */
export interface ConversationsSnapshot {
  lastEventId: number
  conversations: Conversation[]
}

export interface MessagesSnapshot {
  lastEventId: number
  messages: Message[]
}
