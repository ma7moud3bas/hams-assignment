import type { Conversation, Message, Status, StreamEvent } from '../api/types'

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm-1',
    conversationId: 'c-1',
    role: 'customer',
    text: 'hello',
    createdAt: '2026-11-24T10:00:00.000Z',
    ...overrides,
  }
}

export function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c-1',
    customer: 'Sara Alqahtani',
    status: 'ai',
    lastMessage: 'hello',
    unread: 0,
    updatedAt: '2026-11-24T10:00:00.000Z',
    ...overrides,
  }
}

export const msgEvt = (id: number, conversationId: string, message: Message): StreamEvent => ({
  id,
  type: 'message',
  conversationId,
  message,
})

export const startEvt = (id: number, conversationId: string, messageId: string): StreamEvent => ({
  id,
  type: 'message_start',
  conversationId,
  messageId,
  role: 'ai',
})

export const tokenEvt = (id: number, conversationId: string, messageId: string, text: string): StreamEvent => ({
  id,
  type: 'token',
  conversationId,
  messageId,
  text,
})

export const endEvt = (id: number, conversationId: string, messageId: string): StreamEvent => ({
  id,
  type: 'message_end',
  conversationId,
  messageId,
})

export const statusEvt = (id: number, conversationId: string, status: Status): StreamEvent => ({
  id,
  type: 'status',
  conversationId,
  status,
})

export const toolEvt = (id: number, conversationId: string, reason: string): StreamEvent => ({
  id,
  type: 'tool_call',
  conversationId,
  name: 'transfer_to_human',
  args: { reason },
})
