import type { Conversation, ConversationsSnapshot, Message, MessagesSnapshot, StreamEvent } from '../api/types'

/**
 * Pure reducers that fold stream events into the REST snapshots held in the query cache.
 *
 * Every cache entry carries `lastEventId`: the last event already reflected in it. An event
 * with an id at or below that watermark is skipped, which makes applying events idempotent
 * whether the snapshot is behind the stream, ahead of it, or the stream replays itself.
 */

export interface LiveConversation extends Conversation {
  /** The AI reply currently streaming, shown as the list preview. */
  draft: { messageId: string; text: string } | null
  /** Id of the last event that bumped this conversation; 0 = untouched since the snapshot. */
  activity: number
}

export interface ConversationsData {
  lastEventId: number
  conversations: LiveConversation[]
}

export type MessagesData = MessagesSnapshot

export interface Reduced<T> {
  next: T
  /** The event could not be applied consistently; the entry should be refetched. */
  resync: boolean
}

const keep = <T>(next: T): Reduced<T> => ({ next, resync: false })

export function toConversationsData(snapshot: ConversationsSnapshot): ConversationsData {
  return {
    lastEventId: snapshot.lastEventId,
    conversations: snapshot.conversations.map((c) => ({ ...c, draft: null, activity: 0 })),
  }
}

export function reduceConversations(d: ConversationsData, e: StreamEvent): Reduced<ConversationsData> {
  if (e.id <= d.lastEventId) return keep(d)

  const index = d.conversations.findIndex((c) => c.id === e.conversationId)
  const current = d.conversations[index]
  if (!current) return { next: { ...d, lastEventId: e.id }, resync: true }

  let updated: LiveConversation = current
  let resync = false

  switch (e.type) {
    case 'message':
      updated = {
        ...current,
        lastMessage: e.message.text,
        unread: current.unread + (e.message.role === 'customer' ? 1 : 0),
        activity: e.id,
      }
      break
    case 'message_start':
      updated = { ...current, draft: { messageId: e.messageId, text: '' } }
      break
    case 'token':
      if (current.draft?.messageId === e.messageId) {
        updated = { ...current, draft: { messageId: e.messageId, text: current.draft.text + e.text } }
      }
      break
    case 'message_end':
      if (current.draft?.messageId === e.messageId) {
        updated = { ...current, lastMessage: current.draft.text, draft: null, activity: e.id }
      } else {
        // The reply started before our snapshot, so we never saw its beginning.
        updated = { ...current, draft: null }
        resync = true
      }
      break
    case 'status':
      updated = { ...current, status: e.status, activity: e.id }
      break
    case 'tool_call':
      // The hand-off itself means "needs a human"; the status event that follows confirms it.
      updated = { ...current, status: 'needs_human', activity: e.id }
      break
  }

  const conversations = updated === current ? d.conversations : d.conversations.with(index, updated)
  return { next: { lastEventId: e.id, conversations }, resync }
}

function findFromEnd(messages: readonly Message[], id: string): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.id === id) return i
  return -1
}

export function reduceMessages(d: MessagesData, e: StreamEvent): Reduced<MessagesData> {
  if (e.id <= d.lastEventId) return keep(d)

  switch (e.type) {
    case 'message': {
      if (findFromEnd(d.messages, e.message.id) !== -1) return keep({ ...d, lastEventId: e.id })
      return keep({ lastEventId: e.id, messages: [...d.messages, e.message] })
    }
    case 'message_start': {
      if (findFromEnd(d.messages, e.messageId) !== -1) return keep({ ...d, lastEventId: e.id })
      const message: Message = {
        id: e.messageId,
        conversationId: e.conversationId,
        role: 'ai',
        text: '',
        createdAt: new Date().toISOString(),
        streaming: true,
      }
      return keep({ lastEventId: e.id, messages: [...d.messages, message] })
    }
    case 'token': {
      const i = findFromEnd(d.messages, e.messageId)
      const m = d.messages[i]
      if (!m) return { next: d, resync: true }
      return keep({ lastEventId: e.id, messages: d.messages.with(i, { ...m, text: m.text + e.text }) })
    }
    case 'message_end': {
      const i = findFromEnd(d.messages, e.messageId)
      const m = d.messages[i]
      if (!m) return { next: d, resync: true }
      const { streaming: _done, ...finished } = m
      return keep({ lastEventId: e.id, messages: d.messages.with(i, finished) })
    }
    case 'status':
    case 'tool_call':
      return keep(d)
  }
}

/**
 * REST returns a reply that is still streaming only through /messages, so a list snapshot taken
 * mid-reply has no draft: the preview would be stale and message_end would force a refetch (which
 * can itself land mid-reply). Rebuild those drafts from the applied events we still hold.
 * `history` must reach the snapshot's watermark exactly; anything less proves nothing.
 */
export function seedDrafts(d: ConversationsData, history: readonly StreamEvent[]): ConversationsData {
  if (history.at(-1)?.id !== d.lastEventId) return d
  const drafts = new Map<string, { messageId: string; text: string }>()
  for (const e of history) {
    if (e.type === 'message_start') drafts.set(e.conversationId, { messageId: e.messageId, text: '' })
    else if (e.type === 'message_end') drafts.delete(e.conversationId)
    else if (e.type === 'token') {
      const draft = drafts.get(e.conversationId)
      if (draft?.messageId === e.messageId) draft.text += e.text
    }
  }
  if (drafts.size === 0) return d
  return {
    ...d,
    conversations: d.conversations.map((c) => {
      const draft = drafts.get(c.id)
      return draft && !c.draft ? { ...c, draft } : c
    }),
  }
}

/** Brings a snapshot up to date with events that arrived after its watermark. */
export function rebase<T extends { lastEventId: number }>(
  d: T,
  events: readonly StreamEvent[],
  reduce: (d: T, e: StreamEvent) => Reduced<T>,
): Reduced<T> {
  let next = d
  let resync = false
  for (const e of events) {
    const r = reduce(next, e)
    next = r.next
    resync ||= r.resync
  }
  return { next, resync }
}

/** Newest activity first; `sort` is stable, so untouched conversations keep the server's order. */
export function selectSortedConversations(d: ConversationsData): LiveConversation[] {
  return [...d.conversations].sort((a, b) => b.activity - a.activity)
}
