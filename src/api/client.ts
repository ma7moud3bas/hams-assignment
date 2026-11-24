import type { Conversation, ConversationsSnapshot, Message, MessagesSnapshot } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface Api {
  getConversations(): Promise<ConversationsSnapshot>
  getMessages(id: string): Promise<MessagesSnapshot>
  takeover(id: string): Promise<{ conversation: Conversation }>
  sendMessage(id: string, body: { text: string; clientMessageId: string }): Promise<{ message: Message }>
  eventsUrl(since: number): string
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export function createApi(baseUrl: string, fetchImpl: FetchLike = (url, init) => fetch(url, init)): Api {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, init)
    if (!res.ok) {
      let message = res.statusText || `HTTP ${res.status}`
      try {
        const body: unknown = await res.json()
        if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
          message = body.error
        }
      } catch {
        // Not JSON: keep the status text.
      }
      throw new ApiError(res.status, message)
    }
    return (await res.json()) as T
  }

  const post = (body?: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const enc = encodeURIComponent

  return {
    getConversations: () => request('/conversations'),
    getMessages: (id) => request(`/conversations/${enc(id)}/messages`),
    takeover: (id) => request(`/conversations/${enc(id)}/takeover`, post()),
    sendMessage: (id, body) => request(`/conversations/${enc(id)}/messages`, post(body)),
    eventsUrl: (since) => `${baseUrl}/events?since=${since}`,
  }
}
