import { useUiStore } from '../store/uiStore'
import { LOCALES } from './locales'
import type { Strings } from './locales/en'

/** The UI copy for the current language. Re-renders only when the language changes. */
export function useT(): Strings {
  return useUiStore((s) => LOCALES[s.locale].strings)
}
