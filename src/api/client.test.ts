import { ApiError, createApi } from './client'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('createApi', () => {
  it('builds URLs from the base', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { lastEventId: 3, messages: [] }))
    const api = createApi('http://x', fetchImpl)
    await expect(api.getMessages('c-2')).resolves.toEqual({ lastEventId: 3, messages: [] })
    expect(fetchImpl).toHaveBeenCalledWith('http://x/conversations/c-2/messages', undefined)
  })

  it('posts JSON for sendMessage', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(201, { message: { id: 'm-1' } }))
    const api = createApi('http://x', fetchImpl)
    await api.sendMessage('c-1', { text: 'hi', clientMessageId: 'k1' })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://x/conversations/c-1/messages')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(init?.body).toBe('{"text":"hi","clientMessageId":"k1"}')
  })

  it('posts takeover', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, { conversation: { id: 'c-1' } }))
    await createApi('http://x', fetchImpl).takeover('c-1')
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://x/conversations/c-1/takeover')
    expect(fetchImpl.mock.calls[0]![1]?.method).toBe('POST')
  })

  it('turns a 500 into ApiError with the server message', async () => {
    const api = createApi('http://x', async () => jsonResponse(500, { error: 'Random failure, please retry' }))
    const promise = api.sendMessage('c-1', { text: 'hi', clientMessageId: 'k' })
    await expect(promise).rejects.toBeInstanceOf(ApiError)
    await expect(promise).rejects.toMatchObject({ status: 500, message: 'Random failure, please retry' })
  })

  it('turns a 409 into ApiError', async () => {
    const api = createApi('http://x', async () => jsonResponse(409, { error: 'Take over the conversation first' }))
    await expect(api.sendMessage('c-1', { text: 'hi', clientMessageId: 'k' })).rejects.toMatchObject({
      status: 409,
      message: 'Take over the conversation first',
    })
  })

  it('falls back to the status text when the error body is not JSON', async () => {
    const api = createApi('http://x', async () => new Response('boom', { status: 502, statusText: 'Bad Gateway' }))
    await expect(api.getConversations()).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' })
  })

  it('eventsUrl', () => {
    expect(createApi('http://x').eventsUrl(42)).toBe('http://x/events?since=42')
  })
})
