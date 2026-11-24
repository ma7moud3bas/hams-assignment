import { useT } from '../../i18n/useT'
import { useTakeover } from '../../queries/mutations'
import type { Handoff } from '../../store/liveStore'

interface Props {
  conversationId: string
  latest: Handoff | undefined
}

export function HandoffBanner({ conversationId, latest }: Props) {
  const t = useT()
  const takeover = useTakeover(conversationId)
  return (
    <section className="handoff-banner" aria-label={t.handoff.region}>
      <p>
        <strong>{t.handoff.aiAsked} </strong>
        {latest ? (
          <span dir="auto">{latest.reason}</span>
        ) : (
          t.handoff.reasonUnknown
        )}
        {takeover.isError && <span className="inline-error"> {takeover.error.message}</span>}
      </p>
      <button
        type="button"
        className="primary"
        disabled={takeover.isPending}
        onClick={() => takeover.mutate()}
        aria-label={t.handoff.takeOver}
      >
        {takeover.isPending ? t.handoff.takingOver : t.handoff.takeOver}
      </button>
    </section>
  )
}
