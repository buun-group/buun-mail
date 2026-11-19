import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'
import { STORAGE_KEYS } from '../constants/ui'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('the reading pane off', () => {
  it('opens a message in place of the list, and Back or Escape returns to it', async () => {
    localStorage.setItem(STORAGE_KEYS.readingPane, 'off')
    const { container } = render(<App />)
    const app = container.querySelector('.app')
    fireEvent.click(await screen.findByText('Quote for the booking site'))
    expect(app?.getAttribute('data-reading')).toBe('off')
    expect(app?.getAttribute('data-open')).toBe('true')

    fireEvent.click(await screen.findByRole('button', { name: 'Back to Inbox' }))
    expect(app?.getAttribute('data-open')).toBe('false')

    fireEvent.click(screen.getByText('Quote for the booking site'))
    expect(app?.getAttribute('data-open')).toBe('true')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(app?.getAttribute('data-open')).toBe('false')
  })

  it('has no Back button beside the list', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('Quote for the booking site'))
    await screen.findByRole('heading', { name: 'Quote for the booking site', level: 2 })
    expect(screen.queryByRole('button', { name: 'Back to Inbox' })).toBeNull()
  })
})
