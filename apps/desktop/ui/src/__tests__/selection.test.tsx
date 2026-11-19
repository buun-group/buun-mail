import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'
import { STORAGE_KEYS } from '../constants/ui'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(cleanup)

describe('selecting several messages', () => {
  it('selects with checkboxes and Shift, acts on all at once with Undo, and clears', async () => {
    localStorage.setItem(STORAGE_KEYS.conversations, 'off')
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search this list' }), { target: { value: 'quote' } })
    fireEvent.click(screen.getByRole('radio', { name: 'All mail' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Re: Quote for the booking site' }))
    const bar = screen.getByRole('toolbar', { name: 'Selected messages' })
    expect(within(bar).getByText('1 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Quote for the booking site' }), { shiftKey: true })
    expect(within(bar).getByText('2 selected')).toBeTruthy()

    fireEvent.click(within(bar).getByRole('button', { name: 'Move to trash' }))
    expect(await screen.findByText('2 moved to trash')).toBeTruthy()
    expect(screen.queryByRole('toolbar', { name: 'Selected messages' })).toBeNull()
    await waitFor(() => expect(screen.queryByText('Quote for the booking site')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Quote for the booking site')).toBeTruthy()
  })

  it('marks Select all when every row is picked, and clears with Escape', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Quote for the booking site' }))
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toHaveProperty('checked', true)
    expect(screen.getByRole('toolbar', { name: 'Selected messages' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Select Quote for the booking site' }), { key: 'Escape' })
    expect(screen.queryByRole('toolbar', { name: 'Selected messages' })).toBeNull()
  })
})
