import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(cleanup)

const rowFor = async (subject: string): Promise<HTMLElement> => {
  const text = await screen.findByText(subject)
  const row = text.closest('button')
  if (row === null) throw new Error(`No row for ${subject}`)
  return row
}

describe('acting on a message', () => {
  it('archives from the right-click menu with Undo, trashes, and deletes for good after asking', async () => {
    render(<App />)
    fireEvent.contextMenu(await rowFor('Quote for the booking site'))
    const menu = screen.getByRole('menu')
    for (const label of ['Open', 'Mark as read', 'Unstar', 'Archive', 'Move to trash', 'Move to Billing', 'Copy sender address']) expect(within(menu).getByRole('menuitem', { name: label })).toBeTruthy()

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Archive' }))
    expect(await screen.findByText('Archived')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Quote for the booking site')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Quote for the booking site')).toBeTruthy()

    fireEvent.contextMenu(await rowFor('Quote for the booking site'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Move to trash' }))
    await waitFor(() => expect(screen.queryByText('Quote for the booking site')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    fireEvent.contextMenu(await rowFor('Quote for the booking site'))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Delete forever' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this message for good?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete forever' }))
    await waitFor(() => expect(screen.queryByText('Quote for the booking site')).toBeNull())
    expect(screen.getByText('The trash is empty. Mail here goes for good after 30 days.')).toBeTruthy()
  })

  it('stars and marks unread with single keys on the open message', async () => {
    render(<App />)
    const plotwork = await screen.findByRole('region', { name: 'Plotwork' })
    fireEvent.click(within(plotwork).getByRole('button', { name: /Inbox/ }))
    fireEvent.click(await rowFor('Sequence diagrams in the board'))
    await screen.findByRole('heading', { name: 'Sequence diagrams in the board', level: 2 })
    fireEvent.keyDown(window, { key: 's' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Star' }).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.keyDown(window, { key: 'u' })
    await waitFor(() => expect(screen.getAllByLabelText('Unread').length).toBeGreaterThan(0))
  })
})
