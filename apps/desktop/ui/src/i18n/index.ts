/**
 * Starts i18next before the first render, in the language the person chose (or the computer's). Import this once,
 * before the app: `main.tsx` does, and so does the test setup.
 */
import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'

import { STORAGE_KEYS } from '../constants/ui'
import { FALLBACK_LANGUAGE, isLanguage, resolveLanguage } from './languages'
import type { LanguageCode, LanguagePreference } from './languages'
import { NAMESPACES, resources } from './resources'

/** The saved preference, or `system`. */
export function storedLanguage(): LanguagePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.language)
    return value !== null && isLanguage(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

/** The app's one i18next instance. `initReactI18next` hands it to every `useTranslation`. */
const i18n = createInstance()

/** Keeps `<html lang>` and the window title right. Skipped where there is no page, such as a Node test. */
function markPage(code: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = code
  document.title = i18n.t('common:appName')
}

/**
 * The locale dates and times are formatted in: the computer's own regional variant when it speaks the app's language
 * (so English in Australia writes "19 Nov", not "Nov 19"), else the app's language.
 */
export function dateLocale(): string {
  const systemLanguages = typeof navigator === 'undefined' ? [] : navigator.languages
  return systemLanguages.find((tag) => tag.toLowerCase().split('-')[0] === i18n.language) ?? i18n.language
}

/** Switches the whole app to a language. */
export function applyLanguage(code: LanguageCode): void {
  void i18n.changeLanguage(code)
  markPage(code)
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(storedLanguage()),
  fallbackLng: FALLBACK_LANGUAGE,
  ns: NAMESPACES,
  defaultNS: 'common',
  initAsync: false,
  // React escapes what it renders already.
  interpolation: { escapeValue: false },
  returnNull: false,
})

markPage(i18n.language)

export default i18n
