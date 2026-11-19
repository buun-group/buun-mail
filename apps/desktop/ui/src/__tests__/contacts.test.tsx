import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(cleanup)

describe('contacts', () => {
  it('lists people with their counts, shows their mail, and writes to them', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.click(screen.getByRole('button', { name: /Contacts/ }))
    const page = await screen.findByRole('region', { name: 'Contacts' })
    expect(await within(page).findByText('Stripe')).toBeTruthy()
    expect(within(page).getAllByText(/1 message|2 messages/).length).toBeGreaterThan(0)

    fireEvent.click(within(page).getByRole('button', { name: 'Write to Stripe' }))
    const panel = await screen.findByRole('region', { name: 'Write a message' })
    expect(within(panel).getByText('invoices@stripe.com')).toBeTruthy()

    fireEvent.click(within(page).getByRole('button', { name: 'Show mail with Stripe' }))
    expect(await screen.findByText('Your invoice for November is ready')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Search results' })).toBeTruthy()
  })
})
