import { useT } from '../../i18n/useT'
import type { SendError } from '../../store/liveStore'

interface Props {
  errors: SendError[]
  onRetry(error: SendError): void
  onDismiss(clientMessageId: string): void
}

export function SendErrors({ errors, onRetry, onDismiss }: Props) {
  const t = useT()
  if (errors.length === 0) return null
  return (
    <div className="send-errors">
      {errors.map((error) => (
        <div key={error.clientMessageId} className="send-error" role="alert">
          <span>
            {t.composer.sendFailed}{' '}
            <q>
              <bdi>{error.text}</bdi>
            </q>
            : <bdi>{error.error}</bdi>
          </span>
          <button type="button" onClick={() => onRetry(error)}>
            {t.app.retry}
          </button>
          <button type="button" onClick={() => onDismiss(error.clientMessageId)}>
            {t.composer.dismiss}
          </button>
        </div>
      ))}
    </div>
  )
}
