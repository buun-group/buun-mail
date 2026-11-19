import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'
import { INTEGRATIONS } from '../constants/integrations'
import i18n from '../i18n'

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
    // Scoped to the rows: a product such as dissolve.email is also named elsewhere in the window.
    for (const integration of INTEGRATIONS) expect(screen.getAllByText(i18n.t(integration.name, { ns: 'integrations' }), { selector: '.integration__head .settings__label' })).toHaveLength(integration.directions.length)
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

describe('connecting a mail server for sending', () => {
  it('fills a preset and connects, listing the server with its domain', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.keyDown(window, { key: ',', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))
    fireEvent.click(screen.getByRole('button', { name: /^SMTP/ }))
    expect(await screen.findByDisplayValue('smtp.gmail.com')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'me@flung.dev' } })
    fireEvent.change(screen.getByLabelText('Password or app password'), { target: { value: 'app-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    expect(await screen.findByText('me@flung.dev @ smtp.gmail.com:465')).toBeTruthy()
    expect(screen.getAllByText('flung.dev').length).toBeGreaterThan(0)
  })
})

describe('collecting a mailbox over IMAP', () => {
  it('opens Gmail with its servers filled in and lists the mailbox once connected', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.keyDown(window, { key: ',', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Gmail/ })[0] as HTMLElement)
    expect(await screen.findByDisplayValue('imap.gmail.com')).toBeTruthy()
    expect(screen.getByDisplayValue('993')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'me@gmail.com' } })
    fireEvent.change(screen.getByLabelText('Password or app password'), { target: { value: 'app-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    expect(await screen.findByText('me@gmail.com @ imap.gmail.com:993')).toBeTruthy()
  })
})

describe('dissolve.email', () => {
  it('connects through the browser and offers to keep mail after an inbox ends', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.keyDown(window, { key: ',', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))
    fireEvent.click(screen.getByText('dissolve.email', { selector: '.integration__head .settings__label' }).closest('button') as HTMLElement)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
    expect(await screen.findByRole('heading', { name: 'you@example.com' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Keep mail after an inbox ends' })).toBeTruthy()
  })

  it('reads time left in plain words', async () => {
    const { formatTimeLeft, timeLeft } = await import('../lib/dissolve')
    const now = Date.parse('2026-11-20T10:00:00Z')
    expect(formatTimeLeft(timeLeft('2026-11-22T14:30:00Z', now))).toBe('2 d 4 h left')
    expect(formatTimeLeft(timeLeft('2026-11-20T13:12:00Z', now))).toBe('3 h 12 min left')
    expect(timeLeft('2026-11-20T10:20:00Z', now).soon).toBe(true)
    expect(formatTimeLeft(timeLeft('2026-11-20T09:00:00Z', now))).toBe('Ended')
  })
})

describe('verification codes', () => {
  it('offers the code a message carries, ready to copy', async () => {
    const { Verification } = await import('../components/Reader/Verification')
    render(<Verification subject="Confirm your email" from="no-reply@shop.example" text="Your verification code is 482913. It expires in 10 minutes." html={null} />)
    expect(screen.getByText('482913')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })

  it('shows the host a sign-in link opens, and nothing for ordinary mail', async () => {
    const { Verification } = await import('../components/Reader/Verification')
    const { container } = render(<Verification subject="Saturday" from="friend@mail.example" text="Still on for Saturday? It is 2026 after all." html={null} />)
    expect(container.textContent).toBe('')
    render(<Verification subject="Sign in" from="auth@app.example" text={null} html={'<a href="https://login.app.example/verify?token=abc">Sign in</a>'} />)
    expect(screen.getByText('login.app.example')).toBeTruthy()
  })
})

describe('dissolve.email limits', () => {
  it('reads counts against limits in plain words', async () => {
    const { readMeter, formatMinutes } = await import('../lib/dissolve')
    expect(readMeter({ used: 2, limit: 5 })).toEqual({ value: '2 of 5', share: 0.4, full: false })
    expect(readMeter({ used: 5, limit: 5 }).full).toBe(true)
    expect(readMeter({ used: null, limit: 5 }).value).toBe('5 allowed')
    expect(readMeter({ used: null, limit: -1 }).value).toBe('Unlimited')
    expect(readMeter({ used: null, limit: null }).value).toBe('Not reported')
    expect([formatMinutes(10), formatMinutes(90), formatMinutes(2_880)]).toEqual(['10 min', '1 h 30 min', '2 days'])
  })

  it('shows the free plan limits once connected', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.keyDown(window, { key: ',', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))
    fireEvent.click(screen.getByText('dissolve.email', { selector: '.integration__head .settings__label' }).closest('button') as HTMLElement)
    // The preview remembers an earlier test's sign-in, so connect only when it still asks.
    const connect = await screen.findByRole('button', { name: /^(Connect|Check now)$/ })
    if (connect.textContent === 'Connect') fireEvent.click(connect)
    expect(await screen.findByRole('heading', { name: 'Free plan' })).toBeTruthy()
    expect(screen.getByText('New inboxes this hour')).toBeTruthy()
    expect(screen.getByText('1 of 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Compare plans/ })).toBeTruthy()
  })
})
