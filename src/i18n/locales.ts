import { ar } from './locales/ar'
import { en, type Strings } from './locales/en'

export type Direction = 'ltr' | 'rtl'

interface LocaleDefinition {
  /** The language's name in that language, as shown in the switcher. */
  name: string
  dir: Direction
  strings: Strings
}

/**
 * Every supported language. To add one: write `locales/<code>.ts` typed as `Strings`
 * and register it here with its direction. The switcher, the document `lang`/`dir` and the
 * saved preference all follow from this table.
 */
export const LOCALES = {
  en: { name: 'English', dir: 'ltr', strings: en },
  ar: { name: 'العربية', dir: 'rtl', strings: ar },
} as const satisfies Record<string, LocaleDefinition>

export type Locale = keyof typeof LOCALES

export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && Object.hasOwn(LOCALES, value)
}

/** The first of the browser's preferred languages we support ("ar-SA" → "ar"). */
export function pickLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return DEFAULT_LOCALE
}
