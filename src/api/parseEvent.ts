import type { Message, Role, Status, StreamEvent } from './types'

const ROLES: readonly Role[] = ['customer', 'ai', 'human']
const STATUSES: readonly Status[] = ['ai', 'needs_human', 'human', 'closed']

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null
const isStr = (v: unknown): v is string => typeof v === 'string'

function isMessage(v: unknown): v is Message {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.conversationId) &&
    isStr(v.text) &&
    isStr(v.createdAt) &&
    ROLES.includes(v.role as Role)
  )
}

/** Parses one SSE `data:` payload. Returns null for anything that is not a well-formed event. */
export function parseStreamEvent(raw: string): StreamEvent | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(data) || typeof data.id !== 'number' || !Number.isInteger(data.id) || !isStr(data.conversationId)) {
    return null
  }

  switch (data.type) {
    case 'message':
      return isMessage(data.message) ? (data as StreamEvent) : null
    case 'message_start':
      return isStr(data.messageId) ? (data as StreamEvent) : null
    case 'token':
      return isStr(data.messageId) && isStr(data.text) ? (data as StreamEvent) : null
    case 'message_end':
      return isStr(data.messageId) ? (data as StreamEvent) : null
    case 'tool_call':
      return data.name === 'transfer_to_human' && isObj(data.args) && isStr(data.args.reason)
        ? (data as StreamEvent)
        : null
    case 'status':
      return STATUSES.includes(data.status as Status) ? (data as StreamEvent) : null
    default:
      return null
  }
}
