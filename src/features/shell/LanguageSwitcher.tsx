import { useLayoutEffect } from 'react'
import { isLocale, LOCALES, type Locale } from '../../i18n/locales'
import { useT } from '../../i18n/useT'
import { useUiStore } from '../../store/uiStore'

const LOCALE_CODES = Object.keys(LOCALES) as Locale[]

/**
 * Picks the interface language; the layout direction follows it (Arabic is RTL). Message
 * text sets its own direction (dir="auto"), so Arabic and English messages read correctly in any.
 */
export function LanguageSwitcher() {
  const t = useT()
  const locale = useUiStore((s) => s.locale)
  const setLocale = useUiStore((s) => s.setLocale)

  // Before paint, so a saved RTL language never flashes the LTR layout on reload.
  useLayoutEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = LOCALES[locale].dir
    document.title = t.app.documentTitle
  }, [locale, t])

  return (
    <span className="language-switcher">
      <select
        aria-label={t.language.label}
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value)
        }}
      >
        {LOCALE_CODES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LOCALES[code].name}
          </option>
        ))}
      </select>
    </span>
  )
}
