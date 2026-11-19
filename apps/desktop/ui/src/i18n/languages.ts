/**
 * The languages the app speaks. A new language is a folder under `src/locales/<code>/` with the same files as `en`,
 * an entry in `resources.ts`, and a row here with its flag, a small SVG in `public/flags/`. `locales.test.ts` fails when
 * a language is missing a key English has.
 */
export const LANGUAGES = [{ code: 'en', name: 'English', flag: '/flags/gb.svg' }] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

/** What the person picks in Settings: a language, or `system` to follow the computer. */
export type LanguagePreference = 'system' | LanguageCode

/** The language every missing string falls back to. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en'

/** True when a code is one the app speaks. */
export function isLanguage(code: string): code is LanguageCode {
  return LANGUAGES.some((language) => language.code === code)
}

/** The language to show for a preference: the chosen one, or the computer's first language the app speaks. */
export function resolveLanguage(preference: LanguagePreference, systemLanguages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): LanguageCode {
  if (preference !== 'system') return preference
  for (const tag of systemLanguages) {
    const base = tag.toLowerCase().split('-')[0] ?? ''
    if (isLanguage(base)) return base
  }
  return FALLBACK_LANGUAGE
}
