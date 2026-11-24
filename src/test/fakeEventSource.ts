import type { StreamEvent } from '../api/types'
import type { EventSourceLike } from '../stream/streamClient'

/** In-memory stand-in for the browser EventSource, driven by tests. */
export class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = []

  static latest(): FakeEventSource {
    const last = FakeEventSource.instances.at(-1)
    if (!last) throw new Error('no FakeEventSource was created')
    return last
  }

  static reset() {
    FakeEventSource.instances = []
  }

  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent<string>) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  closed = false
  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  open() {
    this.onopen?.(new Event('open'))
  }

  emit(event: StreamEvent) {
    this.emitRaw(JSON.stringify(event), String(event.id))
  }

  /** `lastEventId` is the frame's SSE `id:` line, as the browser reports it. */
  emitRaw(data: string, lastEventId = '') {
    if (this.closed) return
    this.onmessage?.(new MessageEvent('message', { data, lastEventId }))
  }

  fail() {
    this.onerror?.(new Event('error'))
  }

  close() {
    this.closed = true
  }
}

export const createFakeEventSource = (url: string) => new FakeEventSource(url)
