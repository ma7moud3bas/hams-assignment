import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { Api } from '../api/client'
import type { Conversation, ConversationsSnapshot, MessagesSnapshot } from '../api/types'
import { createRuntime, type Runtime } from '../app/runtime'
import { RuntimeProvider } from '../app/RuntimeProvider'
import { createFakeEventSource } from './fakeEventSource'

export interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export interface TestApi {
  getConversations: ReturnType<typeof vi.fn<Api['getConversations']>>
  getMessages: ReturnType<typeof vi.fn<Api['getMessages']>>
  takeover: ReturnType<typeof vi.fn<Api['takeover']>>
  sendMessage: ReturnType<typeof vi.fn<Api['sendMessage']>>
  eventsUrl: Api['eventsUrl']
}

export function createTestApi(conversations: Conversation[] = [], lastEventId = 100): TestApi {
  return {
    getConversations: vi.fn(async (): Promise<ConversationsSnapshot> => ({ lastEventId, conversations })),
    getMessages: vi.fn(async (): Promise<MessagesSnapshot> => ({ lastEventId, messages: [] })),
    takeover: vi.fn(async (id: string) => ({ conversation: { ...conversations.find((c) => c.id === id)!, status: 'human' as const } })),
    sendMessage: vi.fn(),
    eventsUrl: (since: number) => `http://test/events?since=${since}`,
  }
}

export function createTestRuntime(api: TestApi = createTestApi()): Runtime & { api: TestApi } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  })
  const runtime = createRuntime({
    baseUrl: 'http://test',
    api,
    queryClient,
    createEventSource: createFakeEventSource,
    backoffMs: () => 0,
  })
  return { ...runtime, api }
}

export function renderWithRuntime(ui: ReactElement, runtime: Runtime) {
  return render(<RuntimeProvider runtime={runtime}>{ui}</RuntimeProvider>)
}

/** Lets pending promises and zero-delay timers run. */
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * jsdom has no layout. Give scroll containers a 600px viewport and rows the virtualizer's
 * 72px estimate so it renders a window of rows. Call from beforeEach; restored by restoreAllMocks.
 */
export function stubLayout() {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(72)
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(400)
}
