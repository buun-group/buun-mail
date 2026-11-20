/**
 * Every test renders with i18next started in English, as the app does, and starts with nothing remembered. Queries
 * wait up to 5 seconds (not Testing Library's 1): many tests render the whole app, which on a busy machine, such as
 * during `pnpm check` with cargo running, can take longer than a second to settle.
 */
import { configure } from '@testing-library/react'
import { afterEach } from 'vitest'

import '../i18n'

configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
})
