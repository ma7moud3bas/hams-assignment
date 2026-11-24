import { memo } from 'react'
import { useT } from '../../i18n/useT'
import type { LiveConversation } from '../../stream/reducers'
import { StatusBadge } from './StatusBadge'

interface Props {
  conversation: LiveConversation
  selected: boolean
  focusable: boolean
  unread: number
  onSelect(id: string): void
}

export const ConversationListItem = memo(function ConversationListItem({
  conversation: c,
  selected,
  focusable,
  unread,
  onSelect,
}: Props) {
  const t = useT()
  const typing = c.draft !== null && c.draft.text === ''
  const preview = c.draft ? c.draft.text : c.lastMessage

  return (
    <li
      id={`conversation-${c.id}`}
      role="option"
      aria-selected={selected}
      tabIndex={focusable ? 0 : -1}
      className="conversation"
      onClick={() => onSelect(c.id)}
    >
      <div className="conversation-row">
        <span className="conversation-name" dir="auto">
          {c.customer}
        </span>
        <StatusBadge status={c.status} />
      </div>
      <div className="conversation-row">
        {typing ? (
          <span className="conversation-preview typing">{t.list.aiTyping}</span>
        ) : (
          <span className="conversation-preview" dir="auto">
            {preview}
          </span>
        )}
        {unread > 0 && (
          <span className="unread" aria-label={t.list.unread(unread)}>
            {unread}
          </span>
        )}
      </div>
    </li>
  )
})
