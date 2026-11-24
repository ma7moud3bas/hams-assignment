import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { useLiveStore } from '../store/liveStore'
import { initialUiState, useUiStore } from '../store/uiStore'

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

afterEach(() => {
  cleanup()
  useLiveStore.getState().reset()
  useUiStore.setState(initialUiState)
  localStorage.clear()
})
