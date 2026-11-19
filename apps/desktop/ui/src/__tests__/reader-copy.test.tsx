import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { App } from '../App'

const writeText = vi.fn(async () => {})

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(cleanup)

describe('copying from a message', () => {
  it('copies a code on click, and offers it, the message and its actions on right click', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Billing/ }))
    fireEvent.click(await screen.findByText('Your invoice for November is ready'))
    const reader = screen.getByRole('region', { name: 'Reader' })
    const code = await within(reader).findByRole('button', { name: 'Copy INV-2026-11' })

    fireEvent.click(code)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('INV-2026-11'))
    expect(await screen.findByText('Copied')).toBeTruthy()

    fireEvent.contextMenu(code)
    const menu = screen.getByRole('menu', { name: 'Message' })
    for (const label of ['Copy INV-2026-11', 'Select the message text', 'Copy message text', 'Archive', 'Move to trash']) expect(within(menu).getByRole('menuitem', { name: label })).toBeTruthy()
    expect(within(menu).queryByRole('menuitem', { name: 'Open' })).toBeNull()
  })

  it('copies the sender address from the header', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('Quote for the booking site'))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy projects@client.example' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('projects@client.example'))
  })
})
