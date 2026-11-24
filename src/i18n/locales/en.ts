import type { Role, Status } from '../../api/types'

/**
 * The English UI copy. It defines the shape every other language must match, so a missing
 * key in a translation is a type error. Conversation content is never translated.
 */
export const en = {
  app: {
    documentTitle: 'Hams.AI Live Monitor',
    title: 'Live monitor',
    selectConversation: 'Select a conversation',
    retry: 'Retry',
  },
  language: {
    label: 'Language',
  },
  connection: {
    connecting: 'Connecting…',
    connected: 'Connected',
    reconnecting: 'Reconnecting…',
    lastEvent: (id: number) => `Last event #${id}`,
  },
  status: {
    ai: 'AI handling',
    needs_human: 'Needs human',
    human: 'Human handling',
    closed: 'Closed',
  } satisfies Record<Status, string>,
  list: {
    label: 'Conversations',
    loading: 'Loading conversations…',
    loadFailed: "Couldn't load conversations",
    aiTyping: 'AI is typing…',
    unread: (n: number) => `${n} unread`,
  },
  thread: {
    label: 'Conversation',
    messages: 'Messages',
    loading: 'Loading messages…',
    loadFailed: "Couldn't load messages",
    newMessages: 'New messages ↓',
    typing: 'typing',
    sending: 'Sending…',
    sent: 'Sent',
    role: {
      customer: 'Customer',
      ai: 'AI agent',
      human: 'Supervisor',
    } satisfies Record<Role, string>,
  },
  handoff: {
    region: 'Hand-off',
    transferred: 'Transferred to a human',
    aiAsked: 'AI asked for a human.',
    reasonUnknown: 'Reason not available — the hand-off happened before this session started.',
    takeOver: 'Take over',
    takingOver: 'Taking over…',
  },
  composer: {
    label: 'Reply',
    placeholder: 'Write a reply…',
    disabled: {
      ai: 'The AI is handling this conversation',
      needs_human: 'Take over to reply',
      closed: 'This conversation is closed',
    } satisfies Record<Exclude<Status, 'human'>, string>,
    send: 'Send',
    sendFailed: "Couldn't send",
    dismiss: 'Dismiss',
  },
}

export type Strings = typeof en
