import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { IntegrationsSection } from '../components/Settings/IntegrationsSection'

afterEach(cleanup)

/** The picture in a row's glyph box, found from the row's name. */
const logoOf = (name: string): string | null => {
  const row = screen.getByText(name).closest('.integration')
  return row?.querySelector('.integration__glyph img')?.getAttribute('src') ?? null
}

describe('Integrations', () => {
  it("shows dissolve.email and CryptFlare with their own logos, in the window's theme", () => {
    render(<IntegrationsSection onImported={() => undefined} onSendersChanged={() => undefined} theme="dark" />)
    expect(logoOf('dissolve.email')).toBe('/products/dissolve-dark.svg')
    expect(logoOf('CryptFlare')).toBe('/products/cryptflare-dark.png')
    expect(screen.getByRole('heading', { name: 'Keep secrets in' })).toBeTruthy()
  })
})
