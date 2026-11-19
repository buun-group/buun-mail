import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(cleanup)

describe('snooze', () => {
  it('hides a message until a chosen time, lists it under Snoozed, and Unsnooze brings it back', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('Quote for the booking site'))
    const reader = screen.getByRole('region', { name: 'Reader' })
    fireEvent.click(await within(reader).findByRole('button', { name: 'Snooze' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Snooze until' })).getByRole('button', { name: /Tomorrow/ }))
    expect(await screen.findByText(/^Snoozed until/)).toBeTruthy()
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Messages' })).queryByText('Quote for the booking site')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /Snoozed/ }))
    const row = await within(screen.getByRole('region', { name: 'Messages' })).findByText('Quote for the booking site')
    expect(screen.getByText(/^Until /)).toBeTruthy()
    fireEvent.contextMenu(row)
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Unsnooze' }))
    expect(await screen.findByText('Back in its folder')).toBeTruthy()
  })
})
