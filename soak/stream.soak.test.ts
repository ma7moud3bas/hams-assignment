/**
 * Soak test: runs the real mock server and the app's real data layer (no React, no mocks)
 * through at least two forced connection drops, then checks the client's state against the
 * server's. This is the end-to-end proof that resuming never loses or repeats anything.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { EventSource } from 'eventsource'
import type { ConversationsSnapshot, MessagesSnapshot } from '../src/api/types'
import { createRuntime, type Runtime } from '../src/app/runtime'
import { conversationsKey, messagesKey, messagesQueryOptions } from '../src/queries/options'
import { checkConsistency } from '../src/stream/consistency'
import type { ConversationsData, MessagesData } from '../src/stream/reducers'
import { useLiveStore } from '../src/store/liveStore'

const PORT = 4123
const BASE = `http://localhost:${PORT}`
const IDS = ['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7', 'c-8']

let server: ChildProcess
let rt: Runtime

const getJson = async <T>(path: string): Promise<T> => (await fetch(`${BASE}${path}`)).json() as Promise<T>

async function until(condition: () => boolean, timeoutMs: number, what: string) {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

beforeAll(async () => {
  server = spawn(process.execPath, ['mock-server.mjs'], { env: { ...process.env, PORT: String(PORT) } })
  await new Promise<void>((resolve, reject) => {
    server.stdout!.on('data', (chunk: Buffer) => chunk.toString().includes('Mock server on') && resolve())
    server.on('exit', (code) => reject(new Error(`mock exited with ${code}`)))
  })
  rt = createRuntime({ baseUrl: BASE, createEventSource: (url) => new EventSource(url) })
})

afterAll(() => {
  rt?.sync.stop()
  server?.kill()
})

it('stays gap-free and duplicate-free across at least two connection drops', async () => {
  let drops = 0
  // A full resync resets the cursor. The mock never restarts here, so any resync would be a
  // false restart signal (e.g. a replayed frame that didn't match the one we applied).
  let resyncs = 0
  const unsubscribe = useLiveStore.subscribe((s, prev) => {
    if (s.connection === 'reconnecting' && prev.connection !== 'reconnecting') drops++
    if (s.cursor < prev.cursor) resyncs++
  })

  await rt.sync.start()
  await Promise.all(IDS.map((id) => rt.queryClient.fetchQuery(messagesQueryOptions(rt, id))))

  await until(() => drops >= 2 && useLiveStore.getState().connection === 'connected', 120_000, 'two drops')

  // Take the server's view, then let the client catch up past it.
  const list = await getJson<ConversationsSnapshot>('/conversations')
  const threads = await Promise.all(IDS.map((id) => getJson<MessagesSnapshot>(`/conversations/${id}/messages`)))
  const target = Math.max(list.lastEventId, ...threads.map((t) => t.lastEventId))
  await until(() => useLiveStore.getState().cursor >= target, 15_000, `cursor ${target}`)
  unsubscribe()

  const violations: string[] = []
  IDS.forEach((id, i) => {
    const client = rt.queryClient.getQueryData<MessagesData>(messagesKey(id))!
    for (const v of checkConsistency(threads[i]!, client)) violations.push(`${id}: ${v}`)
  })

  // List: status, unread and last message must equal the server's, adjusted for events newer
  // than the server's list snapshot.
  const clientList = rt.queryClient.getQueryData<ConversationsData>(conversationsKey)!
  const newer = rt.buffer.after(list.lastEventId) ?? []
  for (const s of list.conversations) {
    const c = clientList.conversations.find((x) => x.id === s.id)!
    const mine = newer.filter((e) => e.conversationId === s.id)
    if (!mine.some((e) => e.type === 'status' || e.type === 'tool_call') && c.status !== s.status) {
      violations.push(`${s.id}: status ${c.status} ≠ ${s.status}`)
    }
    const extraUnread = mine.filter((e) => e.type === 'message' && e.message.role === 'customer').length
    if (c.unread !== s.unread + extraUnread) violations.push(`${s.id}: unread ${c.unread} ≠ ${s.unread}+${extraUnread}`)
    if (!mine.some((e) => e.type === 'message' || e.type === 'message_end') && c.lastMessage !== s.lastMessage) {
      violations.push(`${s.id}: lastMessage differs`)
    }
  }

  console.log(`soak: ${drops} drops, ${resyncs} resyncs, cursor ${useLiveStore.getState().cursor}, ${violations.length} violations`)
  expect(violations).toEqual([])
  expect(drops).toBeGreaterThanOrEqual(2)
  expect(resyncs).toBe(0)
})
