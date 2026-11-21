import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// The phone shell, as the Android and iOS apps see it.
vi.mock('../api/window', async (original) => ({ ...(await original<typeof import('../api/window')>()), isPhone: true, hasOwnTitleBar: false }))

const { App } = await import('../App')

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('the phone shell', () => {
  it('slides the sidebar out from the menu and away once a place is picked', async () => {
    const { container } = render(<App />)
    const app = container.querySelector('.app')
    await screen.findByText('Quote for the booking site')
    expect(app?.getAttribute('data-sidebar')).toBe('collapsed')
    expect(screen.queryByRole('button', { name: 'Minimise' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open the menu' }))
    expect(app?.getAttribute('data-sidebar')).toBe('open')
    expect(container.querySelector('.app__compose')).toBeNull()

    fireEvent.click(container.querySelector('.app__scrim') as Element)
    expect(app?.getAttribute('data-sidebar')).toBe('collapsed')
    expect(container.querySelector('.app__scrim')).toBeNull()
  })

  it('opens a message over the list, with Back, and keeps the compose button off it', async () => {
    const { container } = render(<App />)
    const app = container.querySelector('.app')
    expect(app?.getAttribute('data-reading')).toBe('off')
    fireEvent.click(await screen.findByText('Quote for the booking site'))
    expect(app?.getAttribute('data-open')).toBe('true')
    expect(container.querySelector('.app__compose')).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: 'Back to Inbox' }))
    expect(app?.getAttribute('data-open')).toBe('false')
    expect(container.querySelector('.app__compose')?.getAttribute('aria-label')).toBe('Compose')
  })
})
