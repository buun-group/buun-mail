/** Every test renders with i18next started in English, as the app does, and starts with nothing remembered. */
import { afterEach } from 'vitest'

import '../i18n'

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})
