import { QueryClient } from '@tanstack/react-query'
import { createApi, type Api } from '../api/client'
import { createEventBuffer, type EventBuffer } from '../stream/eventBuffer'
import type { EventSourceLike } from '../stream/streamClient'
import { createStreamSync, type StreamSync } from '../stream/sync'

export interface Runtime {
  api: Api
  buffer: EventBuffer
  queryClient: QueryClient
  sync: StreamSync
}

export interface RuntimeOptions {
  baseUrl: string
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
  createEventSource?: (url: string) => EventSourceLike
  backoffMs?: (attempt: number) => number
  /** Overrides for tests. */
  api?: Api
  queryClient?: QueryClient
}

/** Everything the app needs, wired once. Works in the browser and in Node (soak test). */
export function createRuntime(opts: RuntimeOptions): Runtime {
  const api = opts.api ?? createApi(opts.baseUrl, opts.fetchImpl)
  const buffer = createEventBuffer()
  const queryClient =
    opts.queryClient ??
    new QueryClient({
      // The stream keeps the cache current, so never refetch on focus or network changes.
      defaultOptions: { queries: { refetchOnWindowFocus: false, refetchOnReconnect: false, retry: 2 } },
    })
  const sync = createStreamSync({
    api,
    buffer,
    queryClient,
    createEventSource: opts.createEventSource,
    backoffMs: opts.backoffMs,
  })
  return { api, buffer, queryClient, sync }
}
