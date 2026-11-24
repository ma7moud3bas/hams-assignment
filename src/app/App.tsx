import { useEffect } from 'react'
import { useT } from '../i18n/useT'
import { ConversationList } from '../features/conversations/ConversationList'
import { ConnectionBadge } from '../features/shell/ConnectionBadge'
import { LanguageSwitcher } from '../features/shell/LanguageSwitcher'
import { Thread } from '../features/thread/Thread'
import { useUiStore } from '../store/uiStore'
import { useRuntime } from './RuntimeProvider'

export function App() {
  const t = useT()
  const rt = useRuntime()
  const selectedId = useUiStore((s) => s.selectedId)

  useEffect(() => {
    void rt.sync.start()
    return () => rt.sync.stop()
  }, [rt])

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t.app.title}</h1>
        <ConnectionBadge />
        <LanguageSwitcher />
      </header>
      <aside className="sidebar">
        <ConversationList />
      </aside>
      {selectedId ? (
        <Thread key={selectedId} conversationId={selectedId} />
      ) : (
        <main className="main">
          <p className="muted empty">{t.app.selectConversation}</p>
        </main>
      )}
    </div>
  )
}
