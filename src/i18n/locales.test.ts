import { DEFAULT_LOCALE, isLocale, LOCALES, pickLocale, type Locale } from './locales'

type Leaf = [path: string, value: unknown]

function leaves(obj: object, prefix = ''): Leaf[] {
  return Object.entries(obj).flatMap(([k, v]): Leaf[] =>
    typeof v === 'object' && v !== null ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  )
}

const text = (v: unknown) => (typeof v === 'function' ? String(v(7)) : String(v))
const english = LOCALES.en.strings
const others = (Object.keys(LOCALES) as Locale[]).filter((l) => l !== 'en')

describe('locales', () => {
  it('registers English (LTR) and Arabic (RTL), each named in its own language', () => {
    expect(LOCALES.en).toMatchObject({ name: 'English', dir: 'ltr' })
    expect(LOCALES.ar).toMatchObject({ name: 'العربية', dir: 'rtl' })
    expect(DEFAULT_LOCALE).toBe('en')
  })

  it.each(others)('%s has every key English has', (locale) => {
    expect(leaves(LOCALES[locale].strings).map(([k]) => k)).toEqual(leaves(english).map(([k]) => k))
  })

  it.each(others)('%s translates every string', (locale) => {
    const englishText = new Map(leaves(english).map(([k, v]) => [k, text(v)]))
    const untranslated = leaves(LOCALES[locale].strings).filter(([k, v]) => text(v) === englishText.get(k))
    expect(untranslated).toEqual([])
  })

  it('Arabic strings are in Arabic script', () => {
    const notArabic = leaves(LOCALES.ar.strings).filter(([, v]) => !/[؀-ۿ]/.test(text(v)))
    expect(notArabic).toEqual([])
  })

  it('interpolates numbers', () => {
    expect(LOCALES.en.strings.list.unread(3)).toBe('3 unread')
    expect(LOCALES.ar.strings.list.unread(3)).toBe('3 غير مقروءة')
  })

  it('isLocale accepts only registered languages', () => {
    expect(isLocale('ar')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })

  it('pickLocale uses the first supported browser language, ignoring the region', () => {
    expect(pickLocale(['ar-SA', 'en-US'])).toBe('ar')
    expect(pickLocale(['fr-FR', 'en-GB'])).toBe('en')
    expect(pickLocale(['fr'])).toBe(DEFAULT_LOCALE)
    expect(pickLocale([])).toBe(DEFAULT_LOCALE)
  })
})
