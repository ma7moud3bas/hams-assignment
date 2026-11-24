import { memo } from 'react'
import { useT } from '../../i18n/useT'
import type { ThreadItem } from './buildThreadItems'
import { HandoffNotice } from './HandoffNotice'
import { MessageBubble } from './MessageBubble'

function MessageRowView({ item }: { item: ThreadItem }) {
  const t = useT()
  switch (item.kind) {
    case 'message':
      return <MessageBubble role={item.message.role} text={item.message.text} streaming={item.message.streaming} />
    case 'handoff':
      return <HandoffNotice handoff={item.handoff} />
    case 'pending':
      return (
        <MessageBubble role="human" text={item.item.text} status={item.item.state === 'sending' ? t.thread.sending : t.thread.sent} />
      )
  }
}

/** The payload object of an item; unchanged identity means unchanged content. */
const payload = (item: ThreadItem) =>
  item.kind === 'message' ? item.message : item.kind === 'handoff' ? item.handoff : item.item

/**
 * Items are rebuilt on every update, but the message objects inside them are only replaced
 * when that message changes. Comparing those keeps a token from re-rendering other rows.
 */
export const MessageRow = memo(
  MessageRowView,
  (prev, next) => prev.item.kind === next.item.kind && payload(prev.item) === payload(next.item),
)
