import { describe, expect, it } from 'vitest'

import { FALLBACK_LANGUAGE, LANGUAGES, resolveLanguage } from '../i18n/languages'
import { NAMESPACES, resources } from '../i18n/resources'

/** Every key path in a nested strings object, such as `language.title`. */
function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix === '' ? key : `${prefix}.${key}`))
}

describe('the strings', () => {
  it.each(LANGUAGES.map((language) => language.code))('%s has every key English has', (code) => {
    for (const namespace of NAMESPACES) {
      const english = keys(resources[FALLBACK_LANGUAGE][namespace]).sort()
      const translated = keys((resources as Record<string, Record<string, unknown>>)[code]?.[namespace]).sort()
      expect(translated, `${code}/${namespace}`).toEqual(english)
    }
  })

  it('carries no em dash', () => {
    expect(JSON.stringify(resources)).not.toContain(String.fromCodePoint(0x2014))
  })
})

describe('resolveLanguage', () => {
  it('follows the computer when asked, and falls back to English', () => {
    expect(resolveLanguage('system', ['en-AU', 'fr'])).toBe('en')
    expect(resolveLanguage('system', ['xx-YY'])).toBe('en')
    expect(resolveLanguage('en', ['fr'])).toBe('en')
  })
})
