import { useQuery } from '@tanstack/react-query'
import { useEffect, type KeyboardEvent } from 'react'
import { useRuntime } from '../../app/RuntimeProvider'
import { useT } from '../../i18n/useT'
import { conversationsQueryOptions } from '../../queries/options'
import { selectSortedConversations } from '../../stream/reducers'
import { displayUnread, useUiStore } from '../../store/uiStore'
import { ConversationListItem } from './ConversationListItem'

const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End']

export function ConversationList() {
  const t = useT()
  const rt = useRuntime()
  const { data, isPending, isError, refetch } = useQuery({
    ...conversationsQueryOptions(rt),
    select: selectSortedConversations,
  })
  const selectedId = useUiStore((s) => s.selectedId)
  const readBaseline = useUiStore((s) => s.readBaseline)
  const select = useUiStore((s) => s.select)
  const markRead = useUiStore((s) => s.markRead)

  // Whatever arrives in the open conversation is read as it arrives.
  const selectedUnread = data?.find((c) => c.id === selectedId)?.unread
  useEffect(() => {
    if (selectedId && selectedUnread !== undefined) markRead(selectedId, selectedUnread)
  }, [selectedId, selectedUnread, markRead])

  if (isPending) return <p className="muted pad">{t.list.loading}</p>
  if (isError) {
    return (
      <div className="pad" role="alert">
        <p>{t.list.loadFailed}</p>
        <button type="button" onClick={() => void refetch()}>
          {t.app.retry}
        </button>
      </div>
    )
  }

  const selectedIndex = data.findIndex((c) => c.id === selectedId)

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (!NAV_KEYS.includes(e.key) || data!.length === 0) return
    e.preventDefault()
    const last = data!.length - 1
    const index =
      e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : e.key === 'ArrowDown' ? Math.min(last, selectedIndex + 1)
      : Math.max(0, selectedIndex - 1)
    const id = data![index]!.id
    select(id)
    document.getElementById(`conversation-${id}`)?.focus()
  }

  return (
    <ul role="listbox" aria-label={t.list.label} className="conversation-list" onKeyDown={onKeyDown}>
      {data.map((c, i) => (
        <ConversationListItem
          key={c.id}
          conversation={c}
          selected={c.id === selectedId}
          focusable={selectedIndex === -1 ? i === 0 : c.id === selectedId}
          unread={displayUnread(c, readBaseline, selectedId)}
          onSelect={select}
        />
      ))}
    </ul>
  )
}
