# Languages

i18next with react-i18next. Every string the app shows lives in `src/locales/<language>/<namespace>.json`; components
call `useTranslation('<namespace>')` and `t('key')`. Keys are type-checked against English.

## Standards

Code here follows:
- [i18n](../../../../../.standards/docs/standards/core/i18n.md) - no copy in components, plurals through i18next, `<html lang>` kept right
- [Copy style](../../../../../.standards/docs/standards/core/copy-style.md) - plain words, no em dash

## Adding a language

1. Copy `src/locales/en/` to `src/locales/<code>/` and translate the values (never the keys).
2. Import its files in `resources.ts` under the new code.
3. Add `{ code, name }` to `LANGUAGES` in `languages.ts`, with the name written in that language.

`src/__tests__/locales.test.ts` fails until every language has every key English has.

## Contents

| Path | Purpose |
|---|---|
| `index.ts` | Starts i18next in the saved or system language; `applyLanguage` switches it |
| `languages.ts` | The languages the app speaks and how a preference resolves |
| `resources.ts` | The bundled strings by language and namespace |
| `i18next.d.ts` | Type-checked keys |
