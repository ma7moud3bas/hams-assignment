import type { StreamEvent } from '../api/types'
import {
  endEvt,
  makeConversation,
  makeMessage,
  msgEvt,
  startEvt,
  statusEvt,
  tokenEvt,
  toolEvt,
} from '../test/fixtures'
import {
  rebase,
  reduceConversations,
  reduceMessages,
  seedDrafts,
  selectSortedConversations,
  toConversationsData,
  type ConversationsData,
  type MessagesData,
} from './reducers'

const foldMessages = (d: MessagesData, events: StreamEvent[]) => events.reduce((acc, e) => reduceMessages(acc, e).next, d)
const foldConvs = (d: ConversationsData, events: StreamEvent[]) =>
  events.reduce((acc, e) => reduceConversations(acc, e).next, d)

const listOf = (...ids: string[]) =>
  toConversationsData({ lastEventId: 10, conversations: ids.map((id) => makeConversation({ id, unread: 0 })) })

describe('reduceMessages', () => {
  it('streams tokens in order into the right message', () => {
    const d0 = { lastEventId: 10, messages: [makeMessage({ id: 'm-1', conversationId: 'c-1' })] }
    const d = foldMessages(d0, [
      startEvt(11, 'c-1', 'm-100'),
      tokenEvt(12, 'c-1', 'm-100', 'Hello'),
      tokenEvt(13, 'c-1', 'm-100', ' world'),
      endEvt(14, 'c-1', 'm-100'),
    ])
    expect(d.messages).toHaveLength(2)
    expect(d.messages.at(-1)).toMatchObject({ id: 'm-100', role: 'ai', text: 'Hello world' })
    expect(d.messages.at(-1)).not.toHaveProperty('streaming')
    expect(d.lastEventId).toBe(14)
  })

  it('marks a started message as streaming', () => {
    const d = foldMessages({ lastEventId: 10, messages: [] }, [startEvt(11, 'c-1', 'm-100')])
    expect(d.messages[0]).toMatchObject({ id: 'm-100', text: '', streaming: true })
  })

  it('ignores events at or below the snapshot watermark', () => {
    const d0 = { lastEventId: 20, messages: [makeMessage({ id: 'm-100', text: 'Hello', streaming: true })] }
    const d = foldMessages(d0, [tokenEvt(19, 'c-1', 'm-100', 'Hello'), tokenEvt(21, 'c-1', 'm-100', ' world')])
    expect(d.messages[0]!.text).toBe('Hello world')
  })

  it('does not append a message whose id is already present', () => {
    const m = makeMessage({ id: 'm-5' })
    const d = foldMessages({ lastEventId: 10, messages: [m] }, [msgEvt(11, 'c-1', m)])
    expect(d.messages).toHaveLength(1)
  })

  it('returns the same reference for status and tool_call', () => {
    const d0 = { lastEventId: 10, messages: [makeMessage()] }
    expect(reduceMessages(d0, statusEvt(11, 'c-1', 'needs_human')).next).toBe(d0)
    expect(reduceMessages(d0, toolEvt(12, 'c-1', 'reason')).next).toBe(d0)
  })

  it('returns the same reference for an already-applied event', () => {
    const d0 = { lastEventId: 10, messages: [makeMessage()] }
    expect(reduceMessages(d0, tokenEvt(10, 'c-1', 'm-1', 'x')).next).toBe(d0)
  })

  it('flags resync when a token targets an unknown message', () => {
    const r = reduceMessages({ lastEventId: 10, messages: [] }, tokenEvt(11, 'c-1', 'm-404', 'x'))
    expect(r.resync).toBe(true)
  })

  it('flags resync when message_end targets an unknown message', () => {
    const r = reduceMessages({ lastEventId: 10, messages: [] }, endEvt(11, 'c-1', 'm-404'))
    expect(r.resync).toBe(true)
  })
})

describe('reduceConversations', () => {
  it('updates lastMessage, unread (customer only) and activity on message', () => {
    let d = listOf('c-1')
    d = foldConvs(d, [msgEvt(11, 'c-1', makeMessage({ id: 'm-9', role: 'customer', text: 'any update?' }))])
    expect(d.conversations[0]).toMatchObject({ lastMessage: 'any update?', unread: 1, activity: 11 })
    d = foldConvs(d, [msgEvt(12, 'c-1', makeMessage({ id: 'm-10', role: 'human', text: 'on it' }))])
    expect(d.conversations[0]).toMatchObject({ lastMessage: 'on it', unread: 1, activity: 12 })
    expect(d.lastEventId).toBe(12)
  })

  it('shows the streaming draft and commits it on message_end', () => {
    let d = foldConvs(listOf('c-1'), [
      startEvt(11, 'c-1', 'm-100'),
      tokenEvt(12, 'c-1', 'm-100', 'Hello'),
      tokenEvt(13, 'c-1', 'm-100', ' world'),
    ])
    expect(d.conversations[0]!.draft).toEqual({ messageId: 'm-100', text: 'Hello world' })
    d = foldConvs(d, [endEvt(14, 'c-1', 'm-100')])
    expect(d.conversations[0]).toMatchObject({ lastMessage: 'Hello world', draft: null, activity: 14 })
  })

  it('keeps interleaved drafts of two conversations apart', () => {
    const d = foldConvs(listOf('c-1', 'c-2'), [
      startEvt(11, 'c-1', 'm-1'),
      startEvt(12, 'c-2', 'm-2'),
      tokenEvt(13, 'c-1', 'm-1', 'A'),
      tokenEvt(14, 'c-2', 'm-2', 'X'),
      tokenEvt(15, 'c-1', 'm-1', ' B'),
      tokenEvt(16, 'c-2', 'm-2', ' Y'),
    ])
    expect(d.conversations.map((c) => c.draft?.text)).toEqual(['A B', 'X Y'])
  })

  it('flags resync on message_end without a matching draft', () => {
    const r = reduceConversations(listOf('c-1'), endEvt(11, 'c-1', 'm-100'))
    expect(r.resync).toBe(true)
    expect(r.next.conversations[0]!.draft).toBeNull()
  })

  it('flags resync for an unknown conversation', () => {
    expect(reduceConversations(listOf('c-1'), statusEvt(11, 'c-9', 'ai')).resync).toBe(true)
  })

  it('applies status changes', () => {
    const d = foldConvs(listOf('c-1'), [statusEvt(11, 'c-1', 'needs_human')])
    expect(d.conversations[0]).toMatchObject({ status: 'needs_human', activity: 11 })
  })

  it('marks needs_human on a transfer_to_human tool call, before any status event', () => {
    const d = foldConvs(listOf('c-1'), [toolEvt(11, 'c-1', 'Customer asked to speak to a person')])
    expect(d.conversations[0]).toMatchObject({ status: 'needs_human', activity: 11 })
  })

  it('ignores events at or below the watermark', () => {
    const d0 = listOf('c-1')
    expect(reduceConversations(d0, statusEvt(10, 'c-1', 'closed')).next).toBe(d0)
  })
})

describe('seedDrafts', () => {
  const snapshotAt = (lastEventId: number) => ({ ...listOf('c-1', 'c-2'), lastEventId })

  it('rebuilds a reply that was mid-stream at the snapshot from buffered events', () => {
    const d = seedDrafts(snapshotAt(14), [
      startEvt(11, 'c-1', 'm-1'),
      tokenEvt(12, 'c-1', 'm-1', 'Hello'),
      startEvt(13, 'c-2', 'm-2'),
      tokenEvt(14, 'c-1', 'm-1', ' wor'),
    ])
    expect(d.conversations.map((c) => c.draft)).toEqual([
      { messageId: 'm-1', text: 'Hello wor' },
      { messageId: 'm-2', text: '' },
    ])
  })

  it('leaves out replies that already ended', () => {
    const d = seedDrafts(snapshotAt(13), [
      startEvt(11, 'c-1', 'm-1'),
      tokenEvt(12, 'c-1', 'm-1', 'Done'),
      endEvt(13, 'c-1', 'm-1'),
    ])
    expect(d.conversations[0]!.draft).toBeNull()
  })

  it('seeds nothing unless the history reaches the snapshot watermark', () => {
    const d0 = snapshotAt(15)
    expect(seedDrafts(d0, [startEvt(11, 'c-1', 'm-1'), tokenEvt(12, 'c-1', 'm-1', 'Hel')])).toBe(d0)
  })

  it('then streams on and commits the full reply', () => {
    let d = seedDrafts(snapshotAt(12), [startEvt(11, 'c-1', 'm-1'), tokenEvt(12, 'c-1', 'm-1', 'Hello')])
    d = foldConvs(d, [tokenEvt(13, 'c-1', 'm-1', ' world'), endEvt(14, 'c-1', 'm-1')])
    expect(d.conversations[0]).toMatchObject({ lastMessage: 'Hello world', draft: null })
  })
})

describe('rebase', () => {
  it('replays only events newer than the snapshot', () => {
    const snap = { lastEventId: 20, messages: [makeMessage({ id: 'm-100', text: 'Hello', streaming: true })] }
    const buffered = [
      tokenEvt(19, 'c-1', 'm-100', 'Hello'),
      tokenEvt(21, 'c-1', 'm-100', ' world'),
      tokenEvt(22, 'c-1', 'm-100', '!'),
    ]
    expect(rebase(snap, buffered, reduceMessages).next.messages[0]!.text).toBe('Hello world!')
  })

  it('ORs the resync flags', () => {
    const r = rebase({ lastEventId: 0, messages: [] }, [tokenEvt(1, 'c-1', 'm-404', 'x')], reduceMessages)
    expect(r.resync).toBe(true)
  })
})

describe('selectSortedConversations', () => {
  it('sorts by latest activity, keeping server order for ties', () => {
    const d = foldConvs(listOf('c-3', 'c-1', 'c-2'), [msgEvt(50, 'c-2', makeMessage({ id: 'm-50', conversationId: 'c-2' }))])
    expect(selectSortedConversations(d).map((c) => c.id)).toEqual(['c-2', 'c-3', 'c-1'])
  })
})
