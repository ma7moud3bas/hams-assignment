import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRuntime } from '../../app/RuntimeProvider'
import { useT } from '../../i18n/useT'
import { useSendMessage } from '../../queries/mutations'
import { conversationsQueryOptions, messagesQueryOptions } from '../../queries/options'
import { useLiveStore, type Handoff } from '../../store/liveStore'
import { StatusBadge } from '../conversations/StatusBadge'
import { buildThreadItems } from './buildThreadItems'
import { Composer } from './Composer'
import { HandoffBanner } from './HandoffBanner'
import { MessageList } from './MessageList'
import { SendErrors } from './SendErrors'

const NO_HANDOFFS: Handoff[] = []

export function Thread({ conversationId }: { conversationId: string }) {
  const t = useT()
  const rt = useRuntime()
  const { data: conversation } = useQuery({
    ...conversationsQueryOptions(rt),
    select: (d) => d.conversations.find((c) => c.id === conversationId),
  })
  const messages = useQuery(messagesQueryOptions(rt, conversationId))
  const handoffs = useLiveStore((s) => s.handoffs[conversationId] ?? NO_HANDOFFS)
  const outbox = useLiveStore(useShallow((s) => s.outbox.filter((o) => o.conversationId === conversationId)))
  const sendErrors = useLiveStore(useShallow((s) => s.sendErrors.filter((e) => e.conversationId === conversationId)))
  const dismissError = useLiveStore((s) => s.dismissError)
  const { send, retry } = useSendMessage(conversationId)
  const status = conversation?.status

  const items = useMemo(
    () => (messages.data ? buildThreadItems(messages.data.messages, handoffs, outbox) : []),
    [messages.data, handoffs, outbox],
  )

  return (
    <section className="main" aria-label={t.thread.label}>
      <header className="thread-header">
        <h2 dir="auto">{conversation?.customer}</h2>
        {status && <StatusBadge status={status} />}
      </header>
      {status === 'needs_human' && <HandoffBanner conversationId={conversationId} latest={handoffs.at(-1)} />}
      {messages.isPending ? (
        <p className="muted empty">{t.thread.loading}</p>
      ) : messages.isError ? (
        <div className="empty" role="alert">
          <p>{t.thread.loadFailed}</p>
          <button type="button" onClick={() => void messages.refetch()}>
            {t.app.retry}
          </button>
        </div>
      ) : (
        <MessageList items={items} />
      )}
      <SendErrors errors={sendErrors} onRetry={retry} onDismiss={dismissError} />
      <Composer status={status} onSend={send} />
    </section>
  )
}
