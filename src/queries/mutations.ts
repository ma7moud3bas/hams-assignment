import { useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useRuntime } from '../app/RuntimeProvider'
import type { ConversationsData } from '../stream/reducers'
import { useLiveStore, type SendError } from '../store/liveStore'
import { conversationsKey } from './options'

export function useTakeover(conversationId: string) {
  const { api, queryClient } = useRuntime()
  return useMutation({
    mutationFn: () => api.takeover(conversationId),
    // The server also emits a status event; applying the response now keeps the UI responsive
    // while the stream is reconnecting. The list's watermark is left alone on purpose.
    onSuccess: ({ conversation }) =>
      queryClient.setQueryData<ConversationsData>(conversationsKey, (d) =>
        d && {
          ...d,
          conversations: d.conversations.map((c) => (c.id === conversationId ? { ...c, status: conversation.status } : c)),
        },
      ),
  })
}

/**
 * Optimistic replies. A reply goes into the outbox (shown at once), and leaves it when the
 * server's `message` event carrying our clientMessageId arrives — so it lands in the thread
 * exactly where the server put it. A rejected POST rolls it back into a visible error.
 */
export function useSendMessage(conversationId: string) {
  const { api } = useRuntime()
  const { mutate } = useMutation({
    mutationFn: (body: { text: string; clientMessageId: string }) => api.sendMessage(conversationId, body),
    onSuccess: (_result, body) => useLiveStore.getState().markSent(body.clientMessageId),
    onError: (error, body) =>
      useLiveStore.getState().fail(body.clientMessageId, error instanceof Error ? error.message : 'Could not send'),
  })

  const deliver = useCallback(
    (text: string, clientMessageId: string) => {
      useLiveStore.getState().enqueue({
        clientMessageId,
        conversationId,
        text,
        createdAt: new Date().toISOString(),
        state: 'sending',
      })
      mutate({ text, clientMessageId })
    },
    [conversationId, mutate],
  )

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (trimmed) deliver(trimmed, crypto.randomUUID())
    },
    [deliver],
  )

  // Same clientMessageId: the failed attempt never reached the server's message log.
  const retry = useCallback(
    (error: SendError) => {
      useLiveStore.getState().dismissError(error.clientMessageId)
      deliver(error.text, error.clientMessageId)
    },
    [deliver],
  )

  return { send, retry }
}
