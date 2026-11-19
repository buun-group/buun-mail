/** Type-checked keys: `t('settings:language.title')` fails `tsc` when the key is not in English. */
import 'i18next'

import type { resources } from './resources'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: (typeof resources)['en']
  }
}
