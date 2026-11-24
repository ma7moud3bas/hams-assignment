import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isLocale, pickLocale, type Locale } from '../i18n/locales'

interface UiState {
  selectedId: string | null
  /** The interface language. Its layout direction comes from the locale table. */
  locale: Locale
  /**
   * The server's unread count when the supervisor last looked at each conversation.
   * The mock has no "mark read" endpoint, so its count only grows; we subtract this baseline.
   */
  readBaseline: Record<string, number>
  select(id: string): void
  setLocale(locale: Locale): void
  markRead(id: string, unread: number): void
  clearReadBaselines(): void
}

export const initialUiState = {
  selectedId: null,
  locale: pickLocale(typeof navigator === 'undefined' ? [] : navigator.languages),
  readBaseline: {},
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...initialUiState,
      select: (selectedId) => set({ selectedId }),
      setLocale: (locale) => set({ locale }),
      markRead: (id, unread) => set((s) => ({ readBaseline: { ...s.readBaseline, [id]: unread } })),
      clearReadBaselines: () => set({ readBaseline: {} }),
    }),
    {
      name: 'hams-ui',
      version: 1,
      // Read markers are only meaningful for the server run they were taken in, so they are
      // not persisted (the mock resets its counts on restart).
      partialize: (s) => ({ locale: s.locale }),
      // Version 0 saved only a direction; RTL meant Arabic.
      migrate: (persisted, version) =>
        version === 0 ? { locale: (persisted as { dir?: string } | null)?.dir === 'rtl' ? 'ar' : 'en' } : persisted,
      // A saved language that has since been removed falls back to the current one.
      merge: (persisted, current) => {
        const locale = (persisted as { locale?: unknown } | null)?.locale
        return isLocale(locale) ? { ...current, locale } : current
      },
    },
  ),
)

export function displayUnread(
  c: { id: string; unread: number },
  baseline: Record<string, number>,
  selectedId: string | null,
): number {
  // The open conversation is read as messages arrive. Its baseline only catches up in an effect
  // after paint, so without this the badge would flash for a frame on every customer message.
  if (c.id === selectedId) return 0
  const seen = baseline[c.id] ?? 0
  // The server's count never goes down, so a larger marker is left over from an earlier run.
  return seen > c.unread ? c.unread : c.unread - seen
}
