import { useT } from '../../i18n/useT'
import { useLiveStore } from '../../store/liveStore'

export function ConnectionBadge() {
  const t = useT()
  const connection = useLiveStore((s) => s.connection)
  const cursor = useLiveStore((s) => s.cursor)
  return (
    <span role="status" className={`connection connection-${connection}`} title={t.connection.lastEvent(cursor)}>
      <span className="connection-dot" aria-hidden="true" />
      {t.connection[connection]}
    </span>
  )
}
