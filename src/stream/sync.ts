import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { Api } from '../api/client'
import type { StreamEvent } from '../api/types'
import { conversationsKey, conversationsQueryOptions, messagesKey } from '../queries/options'
import { useLiveStore } from '../store/liveStore'
import { useUiStore } from '../store/uiStore'
import type { EventBuffer } from './eventBuffer'
import { reduceConversations, reduceMessages, type Reduced } from './reducers'
import { createStreamClient, defaultBackoff, type EventSourceLike, type StreamClient } from './streamClient'

export interface StreamSync {
  start(): Promise<void>
  stop(): void
  /** Throw everything away and start again from fresh snapshots (e.g. after a server restart). */
  resync(): Promise<void>
}

export interface StreamSyncDeps {
  api: Api
  buffer: EventBuffer
  queryClient: QueryClient
  createEventSource?: (url: string) => EventSourceLike
  backoffMs?: (attempt: number) => number
}

/**
 * Connects the event stream to the app's state. For every event, in order:
 * remember it (for rebasing snapshots that are in flight), patch the cached list and the
 * cached thread of that conversation, then update client-only live state.
 */
export function createStreamSync(deps: StreamSyncDeps): StreamSync {
  const { buffer, queryClient } = deps
  const backoff = deps.backoffMs ?? defaultBackoff
  let client: StreamClient | null = null
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let startAttempt = 0
  // Bumped by every start/stop, so a start() that is still awaiting its snapshot can tell
  // it was cancelled (React StrictMode mounts, unmounts and mounts again).
  let generation = 0

  function patch<T>(queryKey: QueryKey, reduce: (d: T, e: StreamEvent) => Reduced<T>, e: StreamEvent) {
    const prev = queryClient.getQueryData<T>(queryKey)
    if (prev === undefined) return
    const { next, resync } = reduce(prev, e)
    if (next !== prev) queryClient.setQueryData(queryKey, next)
    if (resync) void queryClient.invalidateQueries({ queryKey })
  }

  function apply(e: StreamEvent) {
    buffer.push(e)
    patch(conversationsKey, reduceConversations, e)
    patch(messagesKey(e.conversationId), reduceMessages, e)
    const live = useLiveStore.getState()
    live.applyEvent(e)
    live.setCursor(e.id)
  }

  function stop() {
    generation++
    clearTimeout(retryTimer)
    client?.stop()
    client = null
  }

  async function start() {
    stop()
    const current = generation
    const live = useLiveStore.getState()
    live.setConnection('connecting')
    // The stream resumes from the list's watermark, which every applied event advances.
    let data
    try {
      data = await queryClient.fetchQuery(conversationsQueryOptions(deps))
    } catch {
      // Server not reachable yet: keep trying, or the stream would never open.
      if (current === generation) retryTimer = setTimeout(() => void start(), backoff(startAttempt++))
      return
    }
    if (current !== generation) return
    startAttempt = 0
    live.setCursor(data.lastEventId)
    client = createStreamClient({
      url: deps.api.eventsUrl,
      initialCursor: data.lastEventId,
      onEvent: apply,
      onStateChange: (s) => useLiveStore.getState().setConnection(s),
      onReset: () => void resync(),
      // We can't tell what the skipped event changed, so refetch every snapshot to heal.
      onUnreadable: () => void queryClient.invalidateQueries(),
      createEventSource: deps.createEventSource,
      backoffMs: backoff,
    })
    client.start()
  }

  async function resync() {
    stop()
    buffer.clear()
    useLiveStore.getState().reset()
    useUiStore.getState().clearReadBaselines()
    // reset (not remove) so the mounted list stays subscribed to the same query; start() then
    // joins the refetch this triggers. Its failures are handled by start()'s retry.
    queryClient.resetQueries({ queryKey: conversationsKey }).catch(() => {})
    await start()
    // Only after the stream is open: every new thread snapshot is then at or after its start.
    await queryClient.resetQueries({ queryKey: ['messages'] })
  }

  return { start, stop, resync }
}
