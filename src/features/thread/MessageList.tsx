import { useVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../../i18n/useT'
import type { ThreadItem } from './buildThreadItems'
import { MessageRow } from './MessageRow'

/** How close to the bottom (px) still counts as "following" the conversation. */
const STICKY_THRESHOLD = 80
const ESTIMATED_ROW = 72

export function MessageList({ items }: { items: ThreadItem[] }) {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const prevCount = useRef(items.length)
  const [hasNewBelow, setHasNewBelow] = useState(false)

  // This project does not use React Compiler, so the virtualizer's unmemoizable API is fine here.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW,
    overscan: 8,
    // Open at the latest message instead of flashing the top of a long thread first.
    initialOffset: () => items.length * ESTIMATED_ROW,
    getItemKey: (index) => items[index]!.key,
  })

  const last = items.at(-1)
  const lastTextLength = last?.kind === 'message' ? last.message.text.length : 0

  // Follow new messages and growing replies while the user is at the bottom; otherwise
  // leave their scroll position alone and offer a way back down.
  useLayoutEffect(() => {
    const added = items.length > prevCount.current
    prevCount.current = items.length
    if (items.length === 0) return
    if (following.current) virtualizer.scrollToIndex(items.length - 1, { align: 'end' })
    else if (added) setHasNewBelow(true)
  }, [items.length, lastTextLength, virtualizer])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD
    if (following.current) setHasNewBelow(false)
  }

  function jumpToLatest() {
    following.current = true
    setHasNewBelow(false)
    virtualizer.scrollToIndex(items.length - 1, { align: 'end' })
  }

  return (
    <div className="thread-body">
      <div ref={scrollRef} className="message-scroller" onScroll={onScroll} role="log" aria-label={t.thread.messages}>
        <div style={{ blockSize: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="message-row"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <MessageRow item={items[row.index]!} />
            </div>
          ))}
        </div>
      </div>
      {hasNewBelow && (
        <button type="button" className="jump-to-latest primary" onClick={jumpToLatest}>
          {t.thread.newMessages}
        </button>
      )}
    </div>
  )
}
