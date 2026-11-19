import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
})

afterEach(cleanup)

describe('the app in a browser', () => {
  it('opens the first inbox and shows a product while no message is open', async () => {
    render(<App />)
    expect(await screen.findByText('Quote for the booking site')).toBeTruthy()
    expect(screen.getByText('Also from Buun Group')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'From Buun Group' })).toBeTruthy()
  })

  it('says why a message is where it is', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Billing/ }))
    fireEvent.click(await screen.findByText('Your invoice for November is ready'))
    expect(screen.getByText('*@stripe.com')).toBeTruthy()
  })
})
