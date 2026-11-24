import type { StreamEvent } from '../api/types'

export interface EventBuffer {
  push(event: StreamEvent): void
  /**
   * Events with id greater than `id` (optionally for one conversation), oldest first.
   * Returns null when older events were already evicted, so the result can't be proven complete.
   */
  after(id: number, conversationId?: string): StreamEvent[] | null
  /** Buffered events with id at or below `id`, oldest first. Contiguous, but may start anywhere. */
  upTo(id: number): StreamEvent[]
  clear(): void
}

/**
 * Recent applied events, kept so a REST snapshot that lands mid-stream can be brought up to
 * date ("rebased") with the events that arrived after its `lastEventId`.
 * 5,000 events is roughly 4 minutes of the mock's traffic.
 */
export function createEventBuffer(capacity = 5000): EventBuffer {
  let events: StreamEvent[] = []

  return {
    push(event) {
      events.push(event)
      if (events.length > capacity) events.splice(0, events.length - capacity)
    },
    after(id, conversationId) {
      const oldest = events[0]
      if (oldest && oldest.id > id + 1) return null
      return events.filter((e) => e.id > id && (conversationId === undefined || e.conversationId === conversationId))
    },
    upTo(id) {
      return events.filter((e) => e.id <= id)
    },
    clear() {
      events = []
    },
  }
}
