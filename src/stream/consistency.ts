import type { MessagesSnapshot } from '../api/types'
import type { MessagesData } from './reducers'

/**
 * Compares a server snapshot with the client's thread after the client has caught up past the
 * snapshot's lastEventId. The client may be ahead (newer messages, longer streaming text) but
 * must contain every server message, in the same order, exactly once, with the same text.
 * Returns human-readable violations; an empty list means consistent. Used by soak/e2e tests.
 */
export function checkConsistency(server: MessagesSnapshot, client: MessagesData): string[] {
  const violations: string[] = []

  const seen = new Set<string>()
  for (const m of client.messages) {
    if (seen.has(m.id)) violations.push(`duplicate id ${m.id}`)
    seen.add(m.id)
  }

  const byId = new Map(client.messages.map((m) => [m.id, m]))
  let orderReported = false
  server.messages.forEach((s, i) => {
    const c = byId.get(s.id)
    if (!c) {
      violations.push(`missing ${s.id}`)
      return
    }
    if (!orderReported && client.messages[i]?.id !== s.id) {
      violations.push(`order: expected ${s.id} at ${i}, found ${client.messages[i]?.id}`)
      orderReported = true
    }
    if (s.streaming) {
      if (!c.text.startsWith(s.text)) violations.push(`text mismatch ${s.id}: "${c.text}" does not extend "${s.text}"`)
    } else if (c.text !== s.text) {
      violations.push(`text mismatch ${s.id}: "${c.text}" ≠ "${s.text}"`)
    }
  })

  return violations
}
