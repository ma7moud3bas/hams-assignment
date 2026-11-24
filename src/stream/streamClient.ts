import { parseStreamEvent } from '../api/parseEvent'
import type { StreamEvent } from '../api/types'
import type { ConnectionState } from '../store/liveStore'
import { createSequencer, REPLAY_OVERLAP } from './sequencer'

export type { ConnectionState }

/** The subset of the browser EventSource we use; lets tests and Node inject their own. */
export interface EventSourceLike {
  onopen: ((ev: Event) => void) | null
  onmessage: ((ev: MessageEvent<string>) => void) | null
  onerror: ((ev: Event) => void) | null
  close(): void
}

export interface StreamClientOptions {
  url(since: number): string
  initialCursor: number
  /** Called once per event, strictly in id order. */
  onEvent(e: StreamEvent): void
  onStateChange(s: ConnectionState): void
  /** The server restarted (ids went backwards, or a replayed id carried another event). The client has stopped itself. */
  onReset(): void
  /** A frame with this id could not be parsed and was stepped over; whatever it changed is missing. */
  onUnreadable?(id: number): void
  createEventSource?: (url: string) => EventSourceLike
  backoffMs?: (attempt: number) => number
}

export interface StreamClient {
  start(): void
  stop(): void
  readonly cursor: number
}

export const defaultBackoff = (attempt: number) => Math.min(10_000, 500 * 2 ** attempt) + Math.random() * 250

/**
 * Owns the SSE connection. We never let the native EventSource retry on its own: its retry
 * reuses the original URL, and the mock prefers that URL's stale `?since=` over Last-Event-ID,
 * so it would replay everything since page load. Instead every drop closes the source and we
 * reopen with `since=<last event we applied>`.
 */
export function createStreamClient(o: StreamClientOptions): StreamClient {
  const sequencer = createSequencer(o.initialCursor)
  const createSource = o.createEventSource ?? ((url: string) => new EventSource(url))
  const backoff = o.backoffMs ?? defaultBackoff

  let source: EventSourceLike | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let attempt = 0
  let stopped = false
  // The raw frames of the last few applied events. Every resume replays exactly these ids, so
  // they double as a fingerprint: the same id with a different frame means a different server run.
  const recent = new Map<number, string>()

  function detach() {
    if (!source) return
    source.onopen = source.onmessage = source.onerror = null
    source.close()
    source = null
  }

  function connect() {
    const es = createSource(o.url(sequencer.cursor))
    source = es
    es.onopen = () => {
      attempt = 0
      o.onStateChange('connected')
    }
    es.onerror = () => reconnect()
    es.onmessage = (msg) => {
      const event = parseStreamEvent(msg.data)
      if (!event) {
        skipUnreadable(msg)
        return
      }
      switch (sequencer.accept(event)) {
        case 'apply':
          recent.set(event.id, msg.data)
          recent.delete(event.id - REPLAY_OVERLAP)
          o.onEvent(event)
          break
        case 'duplicate': {
          const applied = recent.get(event.id)
          if (applied !== undefined && applied !== msg.data) restarted()
          break
        }
        case 'gap':
          reconnect()
          break
        case 'reset':
          restarted()
          break
      }
    }
  }

  /**
   * Steps over a frame we can't parse if its SSE id says it is the next event. Ignoring it would
   * turn the next event into a gap, and every reconnect would replay it: an endless loop.
   */
  function skipUnreadable(msg: MessageEvent<string>) {
    const id = Number(msg.lastEventId)
    if (msg.lastEventId === '' || id !== sequencer.cursor + 1) return
    sequencer.accept({ id })
    console.warn(`Skipped unreadable stream event #${id}`)
    o.onUnreadable?.(id)
  }

  function restarted() {
    stop()
    o.onReset()
  }

  function reconnect() {
    if (stopped) return
    detach()
    o.onStateChange('reconnecting')
    clearTimeout(timer)
    timer = setTimeout(connect, backoff(attempt++))
  }

  function stop() {
    stopped = true
    clearTimeout(timer)
    detach()
  }

  return {
    start() {
      o.onStateChange('connecting')
      connect()
    },
    stop,
    get cursor() {
      return sequencer.cursor
    },
  }
}
