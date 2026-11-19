import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'
import { INTEGRATIONS } from '../constants/integrations'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  // jsdom has no modal dialogs; open and close are enough for these tests.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(cleanup)

describe('the app in a browser', () => {
  it('opens the first inbox and lists the Buun Group products while no message is open', async () => {
    render(<App />)
    expect(await screen.findByText('Quote for the booking site')).toBeTruthy()
    const more = screen.getByRole('region', { name: 'More from Buun Group' })
    expect(within(more).getByText('Plotwork')).toBeTruthy()
  })

  it('says why a message is where it is', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Billing/ }))
    fireEvent.click(await screen.findByText('Your invoice for November is ready'))
    expect(screen.getByText('*@stripe.com')).toBeTruthy()
  })

  it('opens settings with Ctrl and comma and lists every integration', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.keyDown(window, { key: ',', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))
    for (const integration of INTEGRATIONS) expect(screen.getByText(integration.name)).toBeTruthy()
  })

  it('opens a connect form that says it is not wired up yet', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))
    fireEvent.click(screen.getByRole('button', { name: /Cloudflare Email Routing/ }))
    expect(screen.getByLabelText('API token')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
