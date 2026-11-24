import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useUiStore } from '../../store/uiStore'
import { LanguageSwitcher } from './LanguageSwitcher'

describe('LanguageSwitcher', () => {
  afterEach(() => {
    document.documentElement.dir = 'ltr'
    document.documentElement.lang = 'en'
  })

  it('lists every language by its own name', () => {
    render(<LanguageSwitcher />)
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['English', 'العربية'])
    expect(options[1]).toHaveAttribute('lang', 'ar')
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en')
  })

  it('switching to Arabic sets RTL, the document language and title, and persists it', async () => {
    render(<LanguageSwitcher />)
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.title).toBe('Hams.AI Live Monitor')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
    expect(document.title).toBe('Hams.AI — المراقبة المباشرة')
    expect(localStorage.getItem('hams-ui')).toContain('"ar"')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'اللغة' }), 'en')
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.documentElement.lang).toBe('en')
  })

  it('applies a saved language on the first render', () => {
    useUiStore.setState({ locale: 'ar' })
    render(<LanguageSwitcher />)
    expect(document.documentElement.dir).toBe('rtl')
    expect(screen.getByRole('combobox', { name: 'اللغة' })).toHaveValue('ar')
  })
})
