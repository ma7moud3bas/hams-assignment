import type { StreamEvent } from '../api/types'
import { createFakeEventSource, FakeEventSource } from '../test/fakeEventSource'
import { tokenEvt } from '../test/fixtures'
import type { ConnectionState } from '../store/liveStore'
import { createStreamClient, type StreamClientOptions } from './streamClient'

const tok = (id: number) => tokenEvt(id, 'c-1', 'm-1', `t${id}`)

function setup(overrides: Partial<StreamClientOptions> = {}) {
  const events: StreamEvent[] = []
  const states: ConnectionState[] = []
  const onReset = vi.fn()
  const client = createStreamClient({
    url: (since) => `http://x/events?since=${since}`,
    initialCursor: 10,
    onEvent: (e) => events.push(e),
    onStateChange: (s) => states.push(s),
    onReset,
    createEventSource: createFakeEventSource,
    backoffMs: () => 1000,
    ...overrides,
  })
  client.start()
  return { client, events, states, onReset, ids: () => events.map((e) => e.id) }
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeEventSource.reset()
})
afterEach(() => vi.useRealTimers())

describe('createStreamClient', () => {
  it('opens the stream from the initial cursor', () => {
    const { states } = setup()
    expect(FakeEventSource.instances[0]!.url).toBe('http://x/events?since=10')
    expect(states).toEqual(['connecting'])
    FakeEventSource.latest().open()
    expect(states).toEqual(['connecting', 'connected'])
  })

  it('delivers each event once and in order across a drop', () => {
    const { client, states, ids } = setup()
    const first = FakeEventSource.latest()
    first.open()
    first.emit(tok(11))
    first.emit(tok(12))
    first.fail()
    expect(states.at(-1)).toBe('reconnecting')
    vi.advanceTimersByTime(1000)
    const second = FakeEventSource.latest()
    expect(second).not.toBe(first)
    expect(second.url).toBe('http://x/events?since=12')
    second.open()
    ;[10, 11, 12, 13].forEach((id) => second.emit(tok(id)))
    expect(ids()).toEqual([11, 12, 13])
    expect(client.cursor).toBe(13)
    expect(states.at(-1)).toBe('connected')
  })

  it('closes the native EventSource on error so it never retries with a stale since', () => {
    setup()
    const first = FakeEventSource.latest()
    first.fail()
    expect(first.closed).toBe(true)
  })

  it('reconnects from the cursor on a gap instead of applying out of order', () => {
    const { ids } = setup()
    const first = FakeEventSource.latest()
    first.open()
    first.emit(tok(11))
    first.emit(tok(13))
    expect(ids()).toEqual([11])
    expect(first.closed).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(FakeEventSource.latest().url).toBe('http://x/events?since=11')
  })

  it('calls onReset when ids go back past the replay window', () => {
    const { onReset, ids } = setup({ initialCursor: 500 })
    const first = FakeEventSource.latest()
    first.open()
    first.emit(tok(1))
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(first.closed).toBe(true)
    expect(ids()).toEqual([])
    vi.advanceTimersByTime(60_000)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('detects a restart whose new ids land inside the replay window', () => {
    const { onReset, ids } = setup()
    const first = FakeEventSource.latest()
    first.open()
    ;[11, 12, 13].forEach((id) => first.emit(tok(id)))
    first.fail()
    vi.advanceTimersByTime(1000)
    const second = FakeEventSource.latest()
    second.open()
    // A restarted server that already passed id 13 replays its own events 11..13.
    second.emit(tokenEvt(11, 'c-4', 'm-7', 'other run'))
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(second.closed).toBe(true)
    expect(ids()).toEqual([11, 12, 13])
  })

  it('accepts a replayed id we never applied (the snapshot already had it)', () => {
    const { onReset, ids } = setup()
    const first = FakeEventSource.latest()
    first.open()
    first.emit(tokenEvt(9, 'c-4', 'm-7', 'before our cursor'))
    first.emit(tok(11))
    expect(onReset).not.toHaveBeenCalled()
    expect(ids()).toEqual([11])
  })

  it('ignores a malformed frame that is not the next event', () => {
    const onUnreadable = vi.fn()
    const { ids } = setup({ onUnreadable })
    const first = FakeEventSource.latest()
    first.open()
    expect(() => first.emitRaw('nope')).not.toThrow()
    first.emit(tok(11))
    expect(ids()).toEqual([11])
    expect(onUnreadable).not.toHaveBeenCalled()
  })

  it('steps over an unreadable next event instead of reconnecting forever', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onUnreadable = vi.fn()
    const { client, ids } = setup({ onUnreadable })
    const first = FakeEventSource.latest()
    first.open()
    first.emitRaw('{"id":11,"type":"from_the_future"}', '11')
    first.emit(tok(12))
    expect(ids()).toEqual([12])
    expect(client.cursor).toBe(12)
    expect(first.closed).toBe(false)
    expect(onUnreadable).toHaveBeenCalledWith(11)
    expect(warn).toHaveBeenCalled()
  })

  it('backs off with increasing attempts and resets after a successful open', () => {
    const backoffMs = vi.fn((_attempt: number) => 1000)
    setup({ backoffMs })
    FakeEventSource.latest().fail()
    vi.advanceTimersByTime(1000)
    FakeEventSource.latest().fail()
    vi.advanceTimersByTime(1000)
    FakeEventSource.latest().fail()
    vi.advanceTimersByTime(1000)
    expect(backoffMs.mock.calls.map((c) => c[0])).toEqual([0, 1, 2])
    FakeEventSource.latest().open()
    FakeEventSource.latest().fail()
    expect(backoffMs.mock.calls.at(-1)![0]).toBe(0)
  })

  it('stop() prevents any further reconnects or callbacks', () => {
    const { client, ids, states } = setup()
    const first = FakeEventSource.latest()
    first.fail()
    client.stop()
    vi.advanceTimersByTime(60_000)
    expect(FakeEventSource.instances).toHaveLength(1)
    first.onmessage?.(new MessageEvent('message', { data: JSON.stringify(tok(11)) }))
    expect(ids()).toEqual([])
    expect(states).toEqual(['connecting', 'reconnecting'])
  })
})
