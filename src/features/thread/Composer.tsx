import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Status } from '../../api/types'
import { useT } from '../../i18n/useT'

interface Props {
  status: Status | undefined
  onSend(text: string): void
}

export function Composer({ status, onSend }: Props) {
  const t = useT()
  const enabled = status === 'human'
  const [text, setText] = useState('')

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!enabled || !text.trim()) return
    onSend(text)
    setText('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a newline; never send while an IME (e.g. Arabic) is composing.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        aria-label={t.composer.label}
        dir="auto"
        rows={2}
        value={text}
        disabled={!enabled}
        placeholder={status === undefined ? '' : status === 'human' ? t.composer.placeholder : t.composer.disabled[status]}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className="primary" disabled={!enabled || !text.trim()}>
        {t.composer.send}
      </button>
    </form>
  )
}
