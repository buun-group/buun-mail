import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(cleanup)

describe('conversations', () => {
  it('counts a conversation on its row, lists it above the open message, and opens the sent reply from there', async () => {
    render(<App />)
    expect(await screen.findByLabelText('2 messages in this conversation')).toBeTruthy()
    fireEvent.click(screen.getByText('Quote for the booking site'))
    const strip = await screen.findByRole('region', { name: 'Conversation' })
    expect(within(strip).getByText('You')).toBeTruthy()
    fireEvent.click(within(strip).getByRole('button', { name: /Open the message from You/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Re: Quote for the booking site' })).toBeTruthy())
  })
})

describe('searching all mail', () => {
  it('finds mail in other folders once the scope is All mail', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search this list' }), { target: { value: 'invoice' } })
    expect(await screen.findByText('Nothing here matches “invoice”.')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'All mail' }))
    expect(await screen.findByText('Your invoice for November is ready')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Search results' })).toBeTruthy()
  })
})
