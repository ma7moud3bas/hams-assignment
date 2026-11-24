import { useT } from '../../i18n/useT'
import type { Handoff } from '../../store/liveStore'

export function HandoffNotice({ handoff }: { handoff: Handoff }) {
  const t = useT()
  return (
    <div className="handoff-notice" role="note">
      {t.handoff.transferred} · <span dir="auto">{handoff.reason}</span>
    </div>
  )
}
