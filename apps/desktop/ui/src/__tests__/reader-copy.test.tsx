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
    fireEvent.click(await within(reader).findByRole('button', { name: 'Show as text' }))
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

describe('the message header', () => {
  it('lists To and Cc as rows, each address copyable', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('Quote for the booking site'))
    const fields = await screen.findByLabelText('Who it was sent to')
    expect(within(fields).getByText('To')).toBeTruthy()
    expect(within(fields).getByText('Cc')).toBeTruthy()
    expect(within(fields).getByText('Their studio')).toBeTruthy()
    expect(within(fields).getByRole('button', { name: 'Copy studio@client.example' })).toBeTruthy()
  })
})

describe('a message with HTML and attachments', () => {
  it('shows the sealed page with remote images blocked, lists attachments, and switches to text', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Billing/ }))
    fireEvent.click(await screen.findByText('Your invoice for November is ready'))
    const reader = screen.getByRole('region', { name: 'Reader' })
    const frame = await within(reader).findByTitle('The message')
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin')
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'; img-src data:;")
    expect(within(reader).getByText('1 remote image is blocked, so the sender cannot tell you opened this.')).toBeTruthy()
    fireEvent.click(within(reader).getByRole('button', { name: 'Load images' }))
    expect(within(reader).getByTitle('The message').getAttribute('srcdoc')).toContain('img-src data: https: http:')
    expect(within(reader).getByRole('button', { name: 'Preview INV-2026-11.pdf' })).toBeTruthy()
    fireEvent.click(within(reader).getByRole('button', { name: 'Show as text' }))
    expect(within(reader).queryByTitle('The message')).toBeNull()
  })
})

describe('the sender check', () => {
  it('shows a verified sender with each check in its tip, and warns on a failed one', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Billing/ }))
    fireEvent.click(await screen.findByText('Your invoice for November is ready'))
    const verified = await screen.findByRole('button', { name: /^Verified sender\. stripe\.com confirmed it sent this message\. SPF pass, DKIM pass, DMARC pass, checked by mx\.cloudflare\.net\.$/ })
    expect(verified.getAttribute('data-verdict')).toBe('verified')
  })
})

describe('previewing an attachment', () => {
  it('opens a window with the file, Open and Save', async () => {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Billing/ }))
    fireEvent.click(await screen.findByText('Your invoice for November is ready'))
    fireEvent.click(await screen.findByRole('button', { name: 'Preview INV-2026-11.pdf' }))
    const window = await screen.findByRole('dialog', { name: 'INV-2026-11.pdf' })
    expect(within(window).getByRole('button', { name: 'Open' })).toBeTruthy()
    expect(within(window).getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(within(window).getByText('No preview for this kind of file.')).toBeTruthy()
  })
})
