import { queryOptions } from '@tanstack/react-query'
import type { Api } from '../api/client'
import type { EventBuffer } from '../stream/eventBuffer'
import { rebase, reduceConversations, reduceMessages, seedDrafts, toConversationsData } from '../stream/reducers'

export const conversationsKey = ['conversations'] as const
export const messagesKey = (id: string) => ['messages', id] as const

interface Deps {
  api: Api
  buffer: EventBuffer
}

function eventsSince(buffer: EventBuffer, lastEventId: number, conversationId?: string) {
  const events = buffer.after(lastEventId, conversationId)
  // The buffer no longer reaches back to the snapshot; let the query retry with a fresh one.
  if (!events) throw new Error('event window lost')
  return events
}

/*
 * Each queryFn "rebases" its snapshot: events that reached us while the request was in flight
 * (id > snapshot.lastEventId) are replayed onto it before it lands in the cache, so none are lost.
 * The resync flag is ignored here; a snapshot is as fresh as we can get.
 *
 * staleTime is Infinity because the stream keeps these entries current.
 */

export const conversationsQueryOptions = ({ api, buffer }: Deps) =>
  queryOptions({
    queryKey: conversationsKey,
    queryFn: async () => {
      const snapshot = await api.getConversations()
      const events = eventsSince(buffer, snapshot.lastEventId)
      const data = seedDrafts(toConversationsData(snapshot), buffer.upTo(snapshot.lastEventId))
      return rebase(data, events, reduceConversations).next
    },
    staleTime: Infinity,
  })

export const messagesQueryOptions = ({ api, buffer }: Deps, id: string) =>
  queryOptions({
    queryKey: messagesKey(id),
    queryFn: async () => {
      const snapshot = await api.getMessages(id)
      const events = eventsSince(buffer, snapshot.lastEventId, id)
      return rebase(snapshot, events, reduceMessages).next
    },
    staleTime: Infinity,
    // Updates are immutable already; skip deep-comparing 5,000 messages on every token.
    structuralSharing: false,
  })
