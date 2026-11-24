import { displayUnread, useUiStore } from './uiStore'

describe('useUiStore', () => {
  it('displayUnread subtracts the read baseline', () => {
    expect(displayUnread({ id: 'c-1', unread: 5 }, { 'c-1': 3 }, null)).toBe(2)
    expect(displayUnread({ id: 'c-1', unread: 3 }, { 'c-1': 3 }, null)).toBe(0)
    expect(displayUnread({ id: 'c-2', unread: 4 }, {}, null)).toBe(4)
  })

  it('ignores a read marker larger than the count (left over from an earlier server run)', () => {
    expect(displayUnread({ id: 'c-1', unread: 2 }, { 'c-1': 20 }, null)).toBe(2)
  })

  it('shows 0 for the open conversation even before its read marker catches up', () => {
    expect(displayUnread({ id: 'c-1', unread: 6 }, { 'c-1': 5 }, 'c-1')).toBe(0)
    expect(displayUnread({ id: 'c-2', unread: 6 }, { 'c-2': 5 }, 'c-1')).toBe(1)
  })

  it('persists only the direction, not read markers', () => {
    useUiStore.getState().markRead('c-1', 7)
    expect(localStorage.getItem('hams-ui')).not.toContain('readBaseline')
  })

  it('markRead records the baseline and select stores the selection', () => {
    useUiStore.getState().select('c-1')
    useUiStore.getState().markRead('c-1', 7)
    expect(useUiStore.getState()).toMatchObject({ selectedId: 'c-1', readBaseline: { 'c-1': 7 } })
  })

  it('setLocale switches the language and persists it', () => {
    expect(useUiStore.getState().locale).toBe('en')
    useUiStore.getState().setLocale('ar')
    expect(useUiStore.getState().locale).toBe('ar')
    expect(JSON.parse(localStorage.getItem('hams-ui')!).state).toEqual({ locale: 'ar' })
  })

  it('migrates the saved direction from before languages existed', async () => {
    localStorage.setItem('hams-ui', JSON.stringify({ state: { dir: 'rtl' }, version: 0 }))
    await useUiStore.persist.rehydrate()
    expect(useUiStore.getState().locale).toBe('ar')
  })

  it('ignores a saved language that is no longer available', async () => {
    localStorage.setItem('hams-ui', JSON.stringify({ state: { locale: 'xx' }, version: 1 }))
    await useUiStore.persist.rehydrate()
    expect(useUiStore.getState().locale).toBe('en')
  })
})
