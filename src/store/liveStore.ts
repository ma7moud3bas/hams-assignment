import { create } from 'zustand'
import type { StreamEvent } from '../api/types'

/**
 * Client-only live state: things the REST API cannot give back to us.
 * Server-shaped data (conversations, messages) lives in the TanStack Query cache instead.
 */

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting'

export interface Handoff {
  eventId: number
  conversationId: string
  reason: string
  /** Render right after this message (the last one seen before the hand-off). */
  afterMessageId: string | null
  /** If no message was seen before it: render right before the first one seen after it. */
  beforeMessageId: string | null
}

export interface HandoffState {
  handoffs: Record<string, Handoff[]>
  lastMessageId: Record<string, string>
}

export interface OutboxItem {
  clientMessageId: string
  conversationId: string
  text: string
  createdAt: string
  state: 'sending' | 'sent'
}

export interface SendError {
  clientMessageId: string
  conversationId: string
  text: string
  error: string
}

/** tool_call events are never returned by REST, so their reasons and positions are kept here. */
export function reduceHandoffs(s: HandoffState, e: StreamEvent): HandoffState {
  const conv = e.conversationId

  if (e.type === 'tool_call') {
    const handoff: Handoff = {
      eventId: e.id,
      conversationId: conv,
      reason: e.args.reason,
      afterMessageId: s.lastMessageId[conv] ?? null,
      beforeMessageId: null,
    }
    return { ...s, handoffs: { ...s.handoffs, [conv]: [...(s.handoffs[conv] ?? []), handoff] } }
  }

  if (e.type !== 'message' && e.type !== 'message_start') return s

  const messageId = e.type === 'message' ? e.message.id : e.messageId
  const existing = s.handoffs[conv]
  const handoffs =
    existing?.some((h) => h.afterMessageId === null && h.beforeMessageId === null)
      ? {
          ...s.handoffs,
          [conv]: existing.map((h) =>
            h.afterMessageId === null && h.beforeMessageId === null ? { ...h, beforeMessageId: messageId } : h,
          ),
        }
      : s.handoffs
  return { handoffs, lastMessageId: { ...s.lastMessageId, [conv]: messageId } }
}

interface LiveState extends HandoffState {
  connection: ConnectionState
  /** Id of the last stream event applied. */
  cursor: number
  outbox: OutboxItem[]
  sendErrors: SendError[]
  setConnection(connection: ConnectionState): void
  setCursor(cursor: number): void
  applyEvent(e: StreamEvent): void
  enqueue(item: OutboxItem): void
  markSent(clientMessageId: string): void
  fail(clientMessageId: string, error: string): void
  dismissError(clientMessageId: string): void
  reset(): void
}

const initialState = {
  connection: 'connecting' as ConnectionState,
  cursor: 0,
  handoffs: {},
  lastMessageId: {},
  outbox: [],
  sendErrors: [],
}

export const useLiveStore = create<LiveState>()((set) => ({
  ...initialState,
  setConnection: (connection) => set({ connection }),
  setCursor: (cursor) => set({ cursor }),
  applyEvent: (e) =>
    set((s) => {
      const next = reduceHandoffs(s, e)
      const echoed = e.type === 'message' ? e.message.clientMessageId : undefined
      if (next === s && !echoed) return s
      return {
        handoffs: next.handoffs,
        lastMessageId: next.lastMessageId,
        outbox: echoed ? s.outbox.filter((o) => o.clientMessageId !== echoed) : s.outbox,
      }
    }),
  enqueue: (item) => set((s) => ({ outbox: [...s.outbox, item] })),
  markSent: (clientMessageId) =>
    set((s) => ({
      outbox: s.outbox.map((o) => (o.clientMessageId === clientMessageId ? { ...o, state: 'sent' } : o)),
    })),
  fail: (clientMessageId, error) =>
    set((s) => {
      const item = s.outbox.find((o) => o.clientMessageId === clientMessageId)
      if (!item) return s
      return {
        outbox: s.outbox.filter((o) => o !== item),
        sendErrors: [
          ...s.sendErrors,
          { clientMessageId, conversationId: item.conversationId, text: item.text, error },
        ],
      }
    }),
  dismissError: (clientMessageId) =>
    set((s) => ({ sendErrors: s.sendErrors.filter((e) => e.clientMessageId !== clientMessageId) })),
  reset: () => set(initialState),
}))
