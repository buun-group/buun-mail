import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'
import { STORAGE_KEYS } from '../constants/ui'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
})

afterEach(cleanup)

describe('search', () => {
  it('narrows the list as you type, says when nothing matches, and Escape clears it', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    const box = screen.getByRole('searchbox', { name: 'Search this list' })
    fireEvent.change(box, { target: { value: 'friday quote' } })
    expect(screen.getByText('Quote for the booking site')).toBeTruthy()
    fireEvent.change(box, { target: { value: 'nothing like this' } })
    expect(await screen.findByText('Nothing here matches “nothing like this”.')).toBeTruthy()
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(await screen.findByText('Quote for the booking site')).toBeTruthy()
  })
})

describe('reopening where you left off', () => {
  it('opens the folder and message that were open last time', async () => {
    localStorage.setItem(STORAGE_KEYS.lastPlace, JSON.stringify({ place: { workspace: 'buun', folder: 'Billing' }, view: null, selectedId: 'p1' }))
    render(<App />)
    expect(await screen.findByRole('heading', { level: 2, name: 'Your invoice for November is ready' })).toBeTruthy()
  })

  it('starts at the first inbox when it is turned off', async () => {
    localStorage.setItem(STORAGE_KEYS.rememberPlace, 'off')
    localStorage.setItem(STORAGE_KEYS.lastPlace, JSON.stringify({ place: { workspace: 'buun', folder: 'Billing' }, view: null, selectedId: 'p1' }))
    render(<App />)
    expect(await screen.findByText('Quote for the booking site')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Your invoice for November is ready' })).toBeNull()
  })
})

describe('the reader toolbar', () => {
  it('greys out Reply and Reply all until sending is connected, and opens Integrations', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('Quote for the booking site'))
    const reader = screen.getByRole('region', { name: 'Reader' })
    const reply = await within(reader).findByRole('button', { name: 'Reply' })
    expect(reply.getAttribute('aria-disabled')).toBe('true')
    expect(within(reader).getByRole('button', { name: 'Reply all' }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(reply)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Integrations' })).toBeTruthy())
  })

  it('offers each export format', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('Quote for the booking site'))
    fireEvent.click(await screen.findByRole('button', { name: 'Export this message' }))
    const menu = screen.getByRole('menu', { name: 'Export this message' })
    for (const label of ['Original (.eml)', 'JSON (.json)', 'CSV (.csv)', 'Plain text (.txt)']) expect(within(menu).getByRole('menuitem', { name: label })).toBeTruthy()
  })
})
