import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { App } from '../App'
import { UNDO_SEND_MS } from '../hooks/useCompose'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function openQuote(): Promise<HTMLElement> {
  render(<App />)
  fireEvent.click(await screen.findByText('Quote for the booking site'))
  return screen.getByRole('region', { name: 'Reader' })
}

describe('writing mail', () => {
  it('replies from the address the mail was sent to, quoting it, with the signature', async () => {
    const reader = await openQuote()
    fireEvent.click(await within(reader).findByRole('button', { name: 'Reply' }))
    const panel = await screen.findByRole('region', { name: 'Write a message' })
    expect(within(panel).getByRole('heading', { name: 'Reply' })).toBeTruthy()
    expect(within(panel).getByText('A client')).toBeTruthy()
    expect((within(panel).getByLabelText('Subject') as HTMLInputElement).value).toBe('Re: Quote for the booking site')
    const text = (within(panel).getByLabelText('Message') as HTMLTextAreaElement).value
    expect(text).toContain('-- \nSacha\nBuun Group')
    expect(text).toContain('A client <projects@client.example> wrote:')
    expect(text).toContain('> Could you send the quote through by Friday so we can sign off?')
    expect(within(panel).getByRole('combobox', { name: 'From' }).textContent).toContain('hello@buungroup.com')
  })

  it('sends after the undo window, and Undo brings the message back', async () => {
    const reader = await openQuote()
    fireEvent.click(await within(reader).findByRole('button', { name: 'Reply' }))
    vi.useFakeTimers()
    fireEvent.click(within(screen.getByRole('region', { name: 'Write a message' })).getByRole('button', { name: 'Send' }))
    expect(screen.queryByRole('region', { name: 'Write a message' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('region', { name: 'Write a message' })).toBeTruthy()

    fireEvent.click(within(screen.getByRole('region', { name: 'Write a message' })).getByRole('button', { name: 'Send' }))
    await act(async () => {
      vi.advanceTimersByTime(UNDO_SEND_MS + 10)
      await Promise.resolve()
    })
    vi.useRealTimers()
    expect(await screen.findByText('Sent')).toBeTruthy()
  })

  it('keeps a closed message as a draft and reopens it from Drafts', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.keyDown(window, { key: 'c' })
    const panel = await screen.findByRole('region', { name: 'Write a message' })
    fireEvent.change(within(panel).getByLabelText('Subject'), { target: { value: 'Plans for Friday' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Close, keeping the draft' }))
    fireEvent.click(screen.getByRole('button', { name: /Drafts/ }))
    fireEvent.click(await within(screen.getByRole('region', { name: 'Drafts' })).findByText('Plans for Friday'))
    await waitFor(() => expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Plans for Friday'))
  })
})
