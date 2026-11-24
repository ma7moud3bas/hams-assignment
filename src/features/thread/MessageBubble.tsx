import type { Role } from '../../api/types'
import { useT } from '../../i18n/useT'

interface Props {
  role: Role
  text: string
  streaming?: boolean
  /** Delivery state of one of our own replies ("Sending…", "Sent"). */
  status?: string
}

export function MessageBubble({ role, text, streaming = false, status }: Props) {
  const t = useT()
  return (
    <div className={`bubble bubble-${role}${status ? ' bubble-pending' : ''}`} data-streaming={streaming || undefined}>
      <div className="bubble-meta">
        {t.thread.role[role]}
        {status && ` · ${status}`}
      </div>
      <p dir="auto">
        {text}
        {streaming && <span className="caret" aria-label={t.thread.typing} />}
      </p>
    </div>
  )
}
