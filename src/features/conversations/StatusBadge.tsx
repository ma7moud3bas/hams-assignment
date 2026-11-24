import type { Status } from '../../api/types'
import { useT } from '../../i18n/useT'

export function StatusBadge({ status }: { status: Status }) {
  const t = useT()
  return <span className={`status status-${status}`}>{t.status[status]}</span>
}
