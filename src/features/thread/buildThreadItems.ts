import type { Message } from '../../api/types'
import type { Handoff, OutboxItem } from '../../store/liveStore'

export type ThreadItem =
  | { kind: 'message'; key: string; message: Message }
  | { kind: 'handoff'; key: string; handoff: Handoff }
  | { kind: 'pending'; key: string; item: OutboxItem }

function push(map: Map<string, Handoff[]>, id: string, h: Handoff) {
  const list = map.get(id)
  if (list) list.push(h)
  else map.set(id, [h])
}

/**
 * Merges the thread's three sources into one ordered list: server messages, hand-off notices
 * (anchored to the message seen just before or after them), and our not-yet-echoed replies.
 *
 * A reply keeps the key `c:<clientMessageId>` from "pending" to "echoed by the server", so its
 * row is not remounted when the real message replaces the optimistic one.
 */
export function buildThreadItems(
  messages: readonly Message[],
  handoffs: readonly Handoff[],
  outbox: readonly OutboxItem[],
): ThreadItem[] {
  const after = new Map<string, Handoff[]>()
  const before = new Map<string, Handoff[]>()
  const unplaced = new Set(handoffs)
  for (const h of handoffs) {
    if (h.afterMessageId) push(after, h.afterMessageId, h)
    else if (h.beforeMessageId) push(before, h.beforeMessageId, h)
  }

  const items: ThreadItem[] = []
  const handoffItem = (h: Handoff): ThreadItem => {
    unplaced.delete(h)
    return { kind: 'handoff', key: `h:${h.eventId}`, handoff: h }
  }
  const echoed = new Set<string>()

  for (const message of messages) {
    for (const h of before.get(message.id) ?? []) items.push(handoffItem(h))
    const cmid = message.clientMessageId
    if (cmid) echoed.add(cmid)
    items.push({ kind: 'message', key: cmid ? `c:${cmid}` : `m:${message.id}`, message })
    for (const h of after.get(message.id) ?? []) items.push(handoffItem(h))
  }

  // No anchor yet (or its message isn't loaded): the hand-off is the latest thing that happened.
  for (const h of unplaced) items.push(handoffItem(h))

  for (const item of outbox) {
    if (!echoed.has(item.clientMessageId)) {
      items.push({ kind: 'pending', key: `c:${item.clientMessageId}`, item })
    }
  }
  return items
}
