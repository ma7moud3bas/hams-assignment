import { act, render, screen } from '@testing-library/react'
import { useLiveStore, type ConnectionState } from '../../store/liveStore'
import { useUiStore } from '../../store/uiStore'
import { ConnectionBadge } from './ConnectionBadge'

describe('ConnectionBadge', () => {
  it.each<[ConnectionState, string]>([
    ['connecting', 'Connecting…'],
    ['connected', 'Connected'],
    ['reconnecting', 'Reconnecting…'],
  ])('shows %s', (state, label) => {
    render(<ConnectionBadge />)
    act(() => useLiveStore.getState().setConnection(state))
    expect(screen.getByRole('status')).toHaveTextContent(label)
  })

  it('shows the last applied event id as a tooltip', () => {
    render(<ConnectionBadge />)
    act(() => useLiveStore.getState().setCursor(42))
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Last event #42')
  })
})

describe('ConnectionBadge in Arabic', () => {
  beforeEach(() => useUiStore.setState({ locale: 'ar' }))

  it('shows the state and tooltip in Arabic', () => {
    render(<ConnectionBadge />)
    act(() => {
      useLiveStore.getState().setConnection('reconnecting')
      useLiveStore.getState().setCursor(42)
    })
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ إعادة الاتصال…')
    expect(screen.getByRole('status')).toHaveAttribute('title', 'آخر حدث #42')
  })
})
