import { makeMessage, msgEvt, startEvt, toolEvt } from '../test/fixtures'
import { reduceHandoffs, useLiveStore, type HandoffState, type OutboxItem } from './liveStore'

const empty: HandoffState = { handoffs: {}, lastMessageId: {} }

const outboxItem = (overrides: Partial<OutboxItem> = {}): OutboxItem => ({
  clientMessageId: 'k1',
  conversationId: 'c-1',
  text: 'hi',
  createdAt: '2026-11-24T10:00:00.000Z',
  state: 'sending',
  ...overrides,
})

describe('reduceHandoffs', () => {
  it('anchors a hand-off after the last message seen in that conversation', () => {
    let s = reduceHandoffs(empty, msgEvt(1, 'c-2', makeMessage({ id: 'm-5', conversationId: 'c-2' })))
    s = reduceHandoffs(s, toolEvt(2, 'c-2', 'Customer asked to speak to a person'))
    expect(s.handoffs['c-2']![0]).toMatchObject({
      eventId: 2,
      conversationId: 'c-2',
      afterMessageId: 'm-5',
      beforeMessageId: null,
      reason: 'Customer asked to speak to a person',
    })
  })

  it('anchors before the next message when none was seen yet', () => {
    let s = reduceHandoffs(empty, toolEvt(1, 'c-2', 'Billing dispute needs a supervisor'))
    expect(s.handoffs['c-2']![0]).toMatchObject({ afterMessageId: null, beforeMessageId: null })
    s = reduceHandoffs(s, msgEvt(2, 'c-3', makeMessage({ id: 'm-8', conversationId: 'c-3' })))
    expect(s.handoffs['c-2']![0]!.beforeMessageId).toBeNull()
    s = reduceHandoffs(s, msgEvt(3, 'c-2', makeMessage({ id: 'm-9', conversationId: 'c-2' })))
    s = reduceHandoffs(s, startEvt(4, 'c-2', 'm-10'))
    expect(s.handoffs['c-2']![0]!.beforeMessageId).toBe('m-9')
    expect(s.lastMessageId['c-2']).toBe('m-10')
  })

  it('returns the same state for events that do not concern hand-offs', () => {
    const s = reduceHandoffs(empty, toolEvt(1, 'c-2', 'r'))
    expect(reduceHandoffs(s, { id: 2, type: 'token', conversationId: 'c-2', messageId: 'm-1', text: 'x' })).toBe(s)
  })
})

describe('useLiveStore', () => {
  it('removes the outbox item when the server echoes its clientMessageId', () => {
    const store = useLiveStore.getState()
    store.enqueue(outboxItem())
    store.applyEvent(msgEvt(1, 'c-1', makeMessage({ id: 'm-1', role: 'human', clientMessageId: 'k1' })))
    expect(useLiveStore.getState().outbox).toEqual([])
  })

  it('fail() rolls back the outbox item and records the error', () => {
    const store = useLiveStore.getState()
    store.enqueue(outboxItem())
    store.fail('k1', 'Random failure, please retry')
    expect(useLiveStore.getState().outbox).toEqual([])
    expect(useLiveStore.getState().sendErrors).toEqual([
      { clientMessageId: 'k1', conversationId: 'c-1', text: 'hi', error: 'Random failure, please retry' },
    ])
    store.dismissError('k1')
    expect(useLiveStore.getState().sendErrors).toEqual([])
  })

  it('markSent marks the item sent and ignores unknown ids', () => {
    const store = useLiveStore.getState()
    store.enqueue(outboxItem())
    store.markSent('nope')
    store.markSent('k1')
    expect(useLiveStore.getState().outbox).toEqual([outboxItem({ state: 'sent' })])
  })

  it('reset() clears live state', () => {
    const store = useLiveStore.getState()
    store.enqueue(outboxItem())
    store.setConnection('connected')
    store.setCursor(42)
    store.applyEvent(toolEvt(43, 'c-1', 'r'))
    store.reset()
    expect(useLiveStore.getState()).toMatchObject({
      outbox: [],
      handoffs: {},
      cursor: 0,
      connection: 'connecting',
    })
  })
})
