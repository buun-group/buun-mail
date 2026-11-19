import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message } from '../api/types'

// Captures the app's arrival listener so a test can deliver mail as the Rust side would.
const arrival: { deliver: ((messages: Message[]) => void) | null } = { deliver: null }
vi.mock('../api/events', () => ({
  onMailArrived: (handler: (messages: Message[]) => void) => {
    arrival.deliver = handler
    return () => {}
  },
  onMailChanged: () => () => {},
}))

const { App } = await import('../App')

function mail(id: string, workspace: string): Message {
  return { id, workspace, folder: null, fromName: `Sender ${id}`, from: 'a@b.com', to: 'x@y.com', matched: null, folderMatched: null, subject: `Subject ${id}`, preview: '', receivedAt: '2026-11-19T07:42:00Z', unread: true, starred: false, shelf: 'active', tags: [] }
}

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})
afterEach(cleanup)

async function ready(): Promise<void> {
  render(<App />)
  await screen.findByText('Quote for the booking site')
}

describe('notifications', () => {
  it('counts new mail on the bell and pops a toast while the window is in front', async () => {
    await ready()
    act(() => arrival.deliver?.([mail('n1', 'buun')]))
    expect(screen.getByRole('button', { name: 'Notifications, 1 new' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'New mail' })).getByText('Subject n1')).toBeTruthy()
  })

  it('lists arrivals under the bell and marks them seen when opened', async () => {
    await ready()
    act(() => arrival.deliver?.([mail('n1', 'buun'), mail('n2', 'plotwork')]))
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 2 new' }))
    const panel = screen.getByRole('dialog', { name: 'Notifications' })
    expect(within(panel).getByText('Subject n2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })

  it('keeps a muted workspace out of the toasts but still on the bell', async () => {
    localStorage.setItem('buun-mail:notifications', JSON.stringify({ muted: ['plotwork'] }))
    await ready()
    act(() => arrival.deliver?.([mail('n3', 'plotwork')]))
    expect(screen.getByRole('button', { name: 'Notifications, 1 new' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'New mail' })).queryByText('Subject n3')).toBeNull()
  })
})
