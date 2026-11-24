import { QueryObserver } from '@tanstack/react-query'
import type { ConversationsData, MessagesData } from './reducers'
import { conversationsKey, conversationsQueryOptions, messagesKey, messagesQueryOptions } from '../queries/options'
import { useLiveStore } from '../store/liveStore'
import { useUiStore } from '../store/uiStore'
import { FakeEventSource } from '../test/fakeEventSource'
import {
  endEvt,
  makeConversation,
  makeMessage,
  startEvt,
  statusEvt,
  tokenEvt,
  toolEvt,
} from '../test/fixtures'
import { createTestApi, createTestRuntime, deferred, flush } from '../test/testRuntime'
import type { MessagesSnapshot } from '../api/types'

const conversations = [
  makeConversation({ id: 'c-1' }),
  makeConversation({ id: 'c-2', customer: 'محمد العتيبي' }),
  makeConversation({ id: 'c-3', customer: 'John Carter' }),
]

async function startedRuntime(lastEventId = 100) {
  FakeEventSource.reset()
  const rt = createTestRuntime(createTestApi(conversations, lastEventId))
  await rt.sync.start()
  const es = FakeEventSource.latest()
  es.open()
  return { rt, es }
}

const list = (rt: Awaited<ReturnType<typeof startedRuntime>>['rt']) =>
  rt.queryClient.getQueryData<ConversationsData>(conversationsKey)!
const thread = (rt: Awaited<ReturnType<typeof startedRuntime>>['rt'], id: string) =>
  rt.queryClient.getQueryData<MessagesData>(messagesKey(id))!

describe('createStreamSync', () => {
  it('starts the stream from the conversations snapshot', async () => {
    const { es } = await startedRuntime(100)
    expect(es.url).toBe('http://test/events?since=100')
    expect(useLiveStore.getState().connection).toBe('connected')
  })

  it('applies live events to the list and an open thread', async () => {
    const { rt, es } = await startedRuntime()
    await rt.queryClient.fetchQuery(messagesQueryOptions(rt, 'c-2'))
    es.emit(startEvt(101, 'c-2', 'm-50'))
    es.emit(tokenEvt(102, 'c-2', 'm-50', 'Hi'))
    es.emit(tokenEvt(103, 'c-2', 'm-50', ' there'))
    es.emit(endEvt(104, 'c-2', 'm-50'))
    expect(thread(rt, 'c-2').messages.at(-1)).toMatchObject({ id: 'm-50', text: 'Hi there' })
    expect(list(rt).conversations.find((c) => c.id === 'c-2')!.lastMessage).toBe('Hi there')
    expect(useLiveStore.getState().cursor).toBe(104)
  })

  it('never applies a replayed token twice after a resume', async () => {
    const { rt, es } = await startedRuntime()
    await rt.queryClient.fetchQuery(messagesQueryOptions(rt, 'c-2'))
    es.emit(startEvt(101, 'c-2', 'm-50'))
    es.emit(tokenEvt(102, 'c-2', 'm-50', 'Hi'))
    es.emit(tokenEvt(103, 'c-2', 'm-50', ' there'))
    es.fail()
    await flush()
    const resumed = FakeEventSource.latest()
    expect(resumed.url).toBe('http://test/events?since=103')
    resumed.open()
    resumed.emit(startEvt(101, 'c-2', 'm-50'))
    resumed.emit(tokenEvt(102, 'c-2', 'm-50', 'Hi'))
    resumed.emit(tokenEvt(103, 'c-2', 'm-50', ' there'))
    resumed.emit(tokenEvt(104, 'c-2', 'm-50', '!'))
    expect(thread(rt, 'c-2').messages.at(-1)!.text).toBe('Hi there!')
    expect(thread(rt, 'c-2').messages.filter((m) => m.id === 'm-50')).toHaveLength(1)
  })

  it('keeps tokens that arrive while the messages request is in flight', async () => {
    const { rt, es } = await startedRuntime()
    const pending = deferred<MessagesSnapshot>()
    rt.api.getMessages.mockReturnValueOnce(pending.promise)
    const query = rt.queryClient.fetchQuery(messagesQueryOptions(rt, 'c-2'))
    es.emit(startEvt(101, 'c-2', 'm-50'))
    es.emit(tokenEvt(102, 'c-2', 'm-50', 'Hi'))
    es.emit(tokenEvt(103, 'c-2', 'm-50', ' there'))
    pending.resolve({
      lastEventId: 102,
      messages: [makeMessage({ id: 'm-50', conversationId: 'c-2', role: 'ai', text: 'Hi', streaming: true })],
    })
    await query
    expect(thread(rt, 'c-2').messages).toHaveLength(1)
    expect(thread(rt, 'c-2').messages[0]!.text).toBe('Hi there')
  })

  it('does not double-apply tokens when the snapshot is ahead of the stream', async () => {
    const { rt, es } = await startedRuntime(100)
    rt.api.getMessages.mockResolvedValueOnce({
      lastEventId: 105,
      messages: [makeMessage({ id: 'm-60', conversationId: 'c-2', role: 'ai', text: 'Hello world', streaming: true })],
    })
    await rt.queryClient.fetchQuery(messagesQueryOptions(rt, 'c-2'))
    es.emit(startEvt(101, 'c-2', 'm-60'))
    es.emit(tokenEvt(102, 'c-2', 'm-60', 'Hello'))
    es.emit(tokenEvt(103, 'c-1', 'm-61', 'x'))
    es.emit(statusEvt(104, 'c-3', 'ai'))
    es.emit(tokenEvt(105, 'c-2', 'm-60', ' world'))
    es.emit(tokenEvt(106, 'c-2', 'm-60', '!'))
    expect(thread(rt, 'c-2').messages).toHaveLength(1)
    expect(thread(rt, 'c-2').messages[0]!.text).toBe('Hello world!')
  })

  it('hand-off: tool_call + status mark needs_human and record the reason', async () => {
    const { rt, es } = await startedRuntime()
    es.emit(toolEvt(101, 'c-3', 'Billing dispute needs a supervisor'))
    es.emit(statusEvt(102, 'c-3', 'needs_human'))
    expect(list(rt).conversations.find((c) => c.id === 'c-3')!.status).toBe('needs_human')
    expect(useLiveStore.getState().handoffs['c-3']![0]!.reason).toBe('Billing dispute needs a supervisor')
  })

  it('a list refetch that lands mid-reply keeps the draft and needs no further refetch', async () => {
    const { rt, es } = await startedRuntime(100)
    es.emit(startEvt(101, 'c-2', 'm-50'))
    es.emit(tokenEvt(102, 'c-2', 'm-50', 'Hi'))
    rt.api.getConversations.mockResolvedValueOnce({ lastEventId: 102, conversations })
    await rt.queryClient.refetchQueries({ queryKey: conversationsKey })
    expect(list(rt).conversations.find((c) => c.id === 'c-2')!.draft).toEqual({ messageId: 'm-50', text: 'Hi' })
    es.emit(tokenEvt(103, 'c-2', 'm-50', ' there'))
    es.emit(endEvt(104, 'c-2', 'm-50'))
    await flush()
    expect(list(rt).conversations.find((c) => c.id === 'c-2')!.lastMessage).toBe('Hi there')
    expect(rt.api.getConversations).toHaveBeenCalledTimes(2)
  })

  it('hand-off: the tool_call alone marks needs_human (a drop can delay the status event)', async () => {
    const { rt, es } = await startedRuntime()
    es.emit(toolEvt(101, 'c-3', 'Refund is above the AI limit (500 SAR)'))
    expect(list(rt).conversations.find((c) => c.id === 'c-3')!.status).toBe('needs_human')
    expect(useLiveStore.getState().handoffs['c-3']![0]!.reason).toBe('Refund is above the AI limit (500 SAR)')
  })

  it('start/stop/start opens exactly one stream', async () => {
    FakeEventSource.reset()
    const rt = createTestRuntime(createTestApi(conversations))
    void rt.sync.start()
    rt.sync.stop()
    await rt.sync.start()
    await flush()
    expect(FakeEventSource.instances.filter((i) => !i.closed)).toHaveLength(1)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('server reset triggers a full resync', async () => {
    const { rt, es } = await startedRuntime(500)
    rt.api.getConversations.mockResolvedValueOnce({ lastEventId: 7, conversations })
    es.emit(tokenEvt(1, 'c-1', 'm-1', 'x'))
    await vi.waitFor(() => expect(FakeEventSource.latest()).not.toBe(es))
    expect(rt.api.getConversations).toHaveBeenCalledTimes(2)
    expect(FakeEventSource.latest().url).toBe('http://test/events?since=7')
    expect(es.closed).toBe(true)
  })

  it('keeps trying to start when the first snapshot fails', async () => {
    FakeEventSource.reset()
    const api = createTestApi(conversations)
    api.getConversations.mockRejectedValueOnce(new Error('offline'))
    const rt = createTestRuntime(api)
    await expect(rt.sync.start()).resolves.toBeUndefined()
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
    expect(api.getConversations).toHaveBeenCalledTimes(2)
    expect(FakeEventSource.latest().url).toBe('http://test/events?since=100')
  })

  it('a resync forgets read markers from the previous server run', async () => {
    const { es } = await startedRuntime(500)
    useUiStore.getState().markRead('c-1', 20)
    es.emit(tokenEvt(1, 'c-1', 'm-1', 'x'))
    await vi.waitFor(() => expect(FakeEventSource.latest()).not.toBe(es))
    expect(useUiStore.getState().readBaseline).toEqual({})
  })

  it('refetches the list when message_end arrives without a draft', async () => {
    const { rt, es } = await startedRuntime()
    // The list is always on screen; observe it like the UI does so invalidation refetches it.
    const unsubscribe = new QueryObserver(rt.queryClient, conversationsQueryOptions(rt)).subscribe(() => {})
    es.emit(endEvt(101, 'c-1', 'm-77'))
    await vi.waitFor(() => expect(rt.api.getConversations).toHaveBeenCalledTimes(2))
    unsubscribe()
  })
})
