import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { connectDissolve, createDissolveInbox, disconnectDissolve } from '../api/client'
import { DissolveBar } from '../components/Dissolve/DissolveBar'
import { Overview } from '../components/Dissolve/Overview'
import { DISSOLVE_WORKSPACE } from '../lib/dissolve'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(async () => {
  cleanup()
  await disconnectDissolve(true)
})

const folder = (address: string) => ({ workspace: DISSOLVE_WORKSPACE, folder: address })

describe('dissolve.email plan features', () => {
  it('adds and removes an alias of an inbox on a paid plan', async () => {
    const status = await connectDissolve(undefined, true)
    const address = status.inboxes[0]?.address ?? ''
    render(<DissolveBar place={folder(address)} onOpen={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Aliases' }))
    const popover = await screen.findByRole('dialog', { name: `Aliases of ${address}` })
    expect(await within(popover).findByText('No aliases yet.')).toBeTruthy()
    fireEvent.change(within(popover).getByLabelText('New alias'), { target: { value: 'Billing' } })
    fireEvent.click(within(popover).getByRole('button', { name: 'Add alias' }))
    expect(await within(popover).findByText('billing@dissolve.email')).toBeTruthy()
    fireEvent.click(within(popover).getByRole('button', { name: 'Remove billing@dissolve.email' }))
    await waitFor(() => expect(within(popover).queryByText('billing@dissolve.email')).toBeNull())
  })

  it('offers no aliases on Free, and says when an inbox ends for good', async () => {
    const status = await connectDissolve()
    const address = status.inboxes[0]?.address ?? ''
    render(<DissolveBar place={folder(address)} onOpen={() => undefined} />)
    expect(await screen.findByText(/^Ends for good /)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Aliases' })).toBeNull()
  })

  it('lists agent identities on the overview, renames one and deletes it after asking', async () => {
    await connectDissolve(undefined, true)
    await createDissolveInbox({ name: 'shop', identity: true })
    render(<Overview workspace={undefined} onOpen={() => undefined} />)
    expect(await screen.findByRole('heading', { name: '1 agent identity' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const rename = await screen.findByRole('dialog', { name: 'Label for shop@dissolve.email' })
    fireEvent.change(within(rename).getByLabelText('Label for shop@dissolve.email'), { target: { value: 'GitHub test' } })
    fireEvent.click(within(rename).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('GitHub test')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete identity shop@dissolve.email' }))
    const confirm = screen.getByRole('dialog', { name: 'Delete the identity for shop@dissolve.email?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete identity' }))
    expect(await screen.findByRole('heading', { name: '0 agent identities' })).toBeTruthy()
  })
})
