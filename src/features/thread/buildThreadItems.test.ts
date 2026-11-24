import type { Handoff, OutboxItem } from '../../store/liveStore'
import { makeMessage } from '../../test/fixtures'
import { buildThreadItems } from './buildThreadItems'

const m1 = makeMessage({ id: 'm-1' })
const m2 = makeMessage({ id: 'm-2', role: 'ai' })
const m3 = makeMessage({ id: 'm-3' })

const handoff = (overrides: Partial<Handoff>): Handoff => ({
  eventId: 9,
  conversationId: 'c-1',
  reason: 'Customer asked to speak to a person',
  afterMessageId: null,
  beforeMessageId: null,
  ...overrides,
})

const pending = (overrides: Partial<OutboxItem> = {}): OutboxItem => ({
  clientMessageId: 'k1',
  conversationId: 'c-1',
  text: 'On it',
  createdAt: '2026-11-24T10:00:00.000Z',
  state: 'sending',
  ...overrides,
})

const keys = (items: ReturnType<typeof buildThreadItems>) => items.map((i) => i.key)

describe('buildThreadItems', () => {
  it('keeps messages in order', () => {
    expect(keys(buildThreadItems([m1, m2, m3], [], []))).toEqual(['m:m-1', 'm:m-2', 'm:m-3'])
  })

  it('places a hand-off after its anchor message', () => {
    const items = buildThreadItems([m1, m2, m3], [handoff({ afterMessageId: 'm-2' })], [])
    expect(keys(items)).toEqual(['m:m-1', 'm:m-2', 'h:9', 'm:m-3'])
  })

  it('places a hand-off before its before-anchor when it has no after-anchor', () => {
    const items = buildThreadItems([m1, m2, m3], [handoff({ beforeMessageId: 'm-2' })], [])
    expect(keys(items)).toEqual(['m:m-1', 'h:9', 'm:m-2', 'm:m-3'])
  })

  it('puts a hand-off with no or unknown anchor at the end', () => {
    const items = buildThreadItems(
      [m1, m2],
      [handoff({ eventId: 9 }), handoff({ eventId: 10, afterMessageId: 'm-404' })],
      [pending()],
    )
    expect(keys(items)).toEqual(['m:m-1', 'm:m-2', 'h:9', 'h:10', 'c:k1'])
  })

  it('appends pending outbox items and drops them once the message exists', () => {
    expect(keys(buildThreadItems([m1], [], [pending()]))).toEqual(['m:m-1', 'c:k1'])
    const echoed = makeMessage({ id: 'm-7', role: 'human', clientMessageId: 'k1' })
    const items = buildThreadItems([m1, echoed], [], [pending()])
    expect(keys(items)).toEqual(['m:m-1', 'c:k1'])
    expect(items[1]).toMatchObject({ kind: 'message', message: echoed })
  })
})
