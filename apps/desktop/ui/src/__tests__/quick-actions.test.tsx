import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
})

afterEach(cleanup)

describe('quick actions on a row', () => {
  it('stars and archives from the row without opening the message', async () => {
    render(<App />)
    const toolbar = await screen.findByRole('toolbar', { name: 'Actions for Quote for the booking site' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Unstar' }))
    await waitFor(() => expect(within(screen.getByRole('toolbar', { name: 'Actions for Quote for the booking site' })).getByRole('button', { name: 'Star' })).toBeTruthy())
    expect(screen.queryByRole('heading', { level: 2, name: 'Quote for the booking site' })).toBeNull()

    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Actions for Quote for the booking site' })).getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(screen.queryByText('Quote for the booking site')).toBeNull())
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
  })
})
