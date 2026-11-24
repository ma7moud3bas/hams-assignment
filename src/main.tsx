import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createRuntime } from './app/runtime'
import { RuntimeProvider } from './app/RuntimeProvider'
import './styles.css'

const runtime = createRuntime({ baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:4000' })

// Lets the e2e test read the cache and compare it with the server.
if (import.meta.env.DEV) Object.assign(window, { __hams: runtime })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeProvider runtime={runtime}>
      <App />
    </RuntimeProvider>
  </StrictMode>,
)
