import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

describe('sender checks in the list', () => {
  it('names each check and the size for a dissolve.email message', async () => {
    const { rowDetailsLabel } = await import('../components/MessageList/RowDetails')
    const message = { id: 'x', workspace: 'dissolve', folder: 'a@dissolve.email', fromName: 'Shop', from: 'no-reply@shop.example', to: 'a@dissolve.email', matched: null, folderMatched: null, subject: 'Code', preview: '', receivedAt: '2026-11-20T10:00:00Z', unread: true, starred: false, shelf: 'active' as const, tags: [], threadId: null, threadSize: 1, snoozedUntil: null, size: 6_214, checks: { verdict: 'unclear' as const, by: null, spf: 'pass' as const, dkim: 'fail' as const, dmarc: null } }
    expect(rowDetailsLabel(message)).toBe('SPF pass, DKIM fail, DMARC none, 6 KB')
  })
})

describe('sender checks setting', () => {
  it('shows checks in any workspace and hides them when switched off', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Billing/ }))
    expect(await screen.findByText('SPF pass, DKIM pass, DMARC pass, 63 KB')).toBeTruthy()
    fireEvent.keyDown(window, { key: ',', ctrlKey: true })
    fireEvent.click(screen.getByRole('switch', { name: 'Sender checks and size in the list' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('SPF pass, DKIM pass, DMARC pass, 63 KB')).toBeNull())
  })
})

describe('dissolve.email overview', () => {
  it('lists every live inbox on the workspace page and opens one', async () => {
    const { Overview } = await import('../components/Dissolve/Overview')
    const { preview } = await import('../api/preview')
    preview.dissolve.connect()
    const opened: unknown[] = []
    render(<Overview workspace={undefined} onOpen={(place) => opened.push(place)} />)
    fireEvent.click(await screen.findByText('signup-7k2@dissolve.email'))
    expect(screen.getByRole('heading', { name: /live inbox/ })).toBeTruthy()
    expect(opened).toEqual([{ workspace: 'dissolve', folder: 'signup-7k2@dissolve.email' }])
  })
})

describe('verification code look-alikes', () => {
  it('does not take an invoice number for a code, but keeps a prefixed code in a sign-in mail', async () => {
    const { Verification } = await import('../components/Reader/Verification')
    const { container } = render(<Verification subject="Your invoice for November is ready" from="invoices@stripe.com" text="Invoice INV-2026-11 is now available." html={null} />)
    expect(container.textContent).toBe('')
    render(<Verification subject="Your sign-in code" from="no-reply@accounts.example" text="Use G-847293 to sign in." html={null} />)
    expect(screen.getByText('G-847293')).toBeTruthy()
  })
})

describe('secrets and alerts', () => {
  it('shows a saved key only after the reveal code once one is set', async () => {
    const { preview } = await import('../api/preview')
    preview.security.set(null, '2468')
    const { SecretField } = await import('../components/Settings/SecretField')
    render(<SecretField kind="sender" id="preview-sender" label="API key" />)
    expect(screen.getByText('****************')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show API key' }))
    const code = await screen.findByLabelText('Reveal code')
    fireEvent.change(code, { target: { value: '1111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(await screen.findByText('That code is not right.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Reveal code'), { target: { value: '2468' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(await screen.findByText('re_demo_key_1234')).toBeTruthy()
    preview.security.set('2468', null)
  })

  it('adds a Slack alert channel and offers it in a rule', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.keyDown(window, { key: ',', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Integrations' }))
    fireEvent.click(screen.getByText('Slack', { selector: '.integration__head .settings__label' }).closest('button') as HTMLElement)
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'GunSpec sales' } })
    fireEvent.change(screen.getByLabelText('Webhook address'), { target: { value: 'https://hooks.slack.com/services/T/B/x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('heading', { name: 'GunSpec sales' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show Webhook address' })).toBeTruthy()
  })
})

describe('unsubscribe and block', () => {
  it('unsubscribes in one click where the list allows it', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Billing/ }))
    fireEvent.click(await screen.findByText('Your invoice for November is ready'))
    fireEvent.click(await screen.findByRole('button', { name: /Unsubscribe/ }))
    expect(await screen.findByText('stripe.com should stop writing within a few days.')).toBeTruthy()
  })

  it('blocks a sender from the message menu', async () => {
    render(<App />)
    const row = await screen.findByText('Quote for the booking site')
    fireEvent.contextMenu(row)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Block projects@client.example' }))
    expect(await screen.findByText('projects@client.example blocked')).toBeTruthy()
  })
})

describe('scheduled and follow-ups', () => {
  it('lists what is scheduled and waiting for a reply', async () => {
    const { preview } = await import('../api/preview')
    preview.later.schedule({ from: { name: null, address: 'hello@buungroup.com' }, to: [{ name: null, address: 'client@client.example' }], cc: [], bcc: [], subject: 'Invoice reminder', text: 'Hi', replyToMessage: null, attachments: [] }, new Date(Date.now() + 3_600_000))
    preview.later.remind('p5', 3)
    const { ScheduledList } = await import('../components/Scheduled/ScheduledList')
    render(<ScheduledList />)
    expect(await screen.findByText('Invoice reminder')).toBeTruthy()
    expect(screen.getByText('Re: Quote for the booking site')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sending Invoice reminder' }))
    expect(await screen.findByText(/Nothing scheduled/)).toBeTruthy()
  })
})

describe('conversation notes', () => {
  it('adds a private note and shows it again', async () => {
    const { ConversationNote } = await import('../components/Reader/ConversationNote')
    render(<ConversationNote messageId="p2" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a note' }))
    const box = await screen.findByLabelText('Note')
    fireEvent.change(box, { target: { value: 'Refunded in Stripe' } })
    fireEvent.blur(box)
    expect(await screen.findByText('Refunded in Stripe')).toBeTruthy()
  })
})

describe('backup', () => {
  it('asks for a long enough passphrase, typed twice', async () => {
    const { BackupPanel } = await import('../components/Settings/BackupPanel')
    render(<BackupPanel />)
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }))
    expect(await screen.findByText('Use a passphrase of at least 8 characters.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'correct horse' } })
    fireEvent.change(screen.getByLabelText('Passphrase again'), { target: { value: 'correct horses' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save a backup' }))
    expect(await screen.findByText('The two passphrases are not the same.')).toBeTruthy()
  })
})

describe('busy buttons and skeletons', () => {
  it('shows a button working until its work is done, and refuses a second press', async () => {
    const { BusyButton } = await import('../components/Busy/BusyButton')
    const { IconRegenerate } = await import('../icons')
    let finish = (): void => {}
    let runs = 0
    render(
      <BusyButton glyph={IconRegenerate} busyLabel="Checking..." run={() => new Promise<void>((resolve) => { runs += 1; finish = resolve })}>
        Check now
      </BusyButton>,
    )
    const button = screen.getByRole('button', { name: 'Check now' })
    fireEvent.click(button)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.textContent).toBe('Checking...')
    fireEvent.click(button)
    expect(runs).toBe(1)
    finish()
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('false'), { timeout: 2000 })
  })

  it('holds a loading panel with placeholder rows', async () => {
    const { Skeleton } = await import('../components/Busy/Skeleton')
    render(<Skeleton rows={3} label="Loading" />)
    expect(screen.getByRole('status', { name: 'Loading' }).querySelectorAll('.skeleton__row')).toHaveLength(3)
  })
})

describe('press feedback and the focus ring', () => {
  it('shows the focus ring after the keyboard only', async () => {
    const { followInputMode } = await import('../lib/inputMode')
    followInputMode()
    expect(document.documentElement.dataset['input']).toBe('pointer')
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.documentElement.dataset['input']).toBe('keyboard')
    fireEvent.pointerDown(window)
    expect(document.documentElement.dataset['input']).toBe('pointer')
  })

  it('says it worked right on the button once its work is done', async () => {
    const { BusyButton } = await import('../components/Busy/BusyButton')
    const { IconBell } = await import('../icons')
    render(
      <BusyButton glyph={IconBell} doneLabel="Sent" run={async () => undefined}>
        Send a test
      </BusyButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send a test' }))
    expect(await screen.findByRole('button', { name: 'Sent' }, { timeout: 2000 })).toBeTruthy()
  })
})
