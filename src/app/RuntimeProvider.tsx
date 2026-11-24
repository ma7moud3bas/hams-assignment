import { QueryClientProvider } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import type { Runtime } from './runtime'

const RuntimeContext = createContext<Runtime | null>(null)

export function RuntimeProvider({ runtime, children }: { runtime: Runtime; children: ReactNode }) {
  return (
    <RuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={runtime.queryClient}>{children}</QueryClientProvider>
    </RuntimeContext.Provider>
  )
}

// The hook belongs next to its provider; fast refresh of this file is not a concern.
// oxlint-disable-next-line react/only-export-components
export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('useRuntime must be used inside <RuntimeProvider>')
  return runtime
}
