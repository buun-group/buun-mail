import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { connectDissolve, disconnectDissolve } from '../api/client'
import type { Place } from '../api/types'
import { DissolveBar } from '../components/Dissolve/DissolveBar'
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

const root: Place = { workspace: DISSOLVE_WORKSPACE, folder: null }

describe('dissolve.email agent identities', () => {
  it('makes an identity with a new address on a plan that has them, shows it, and regenerates it after asking', async () => {
    await connectDissolve(undefined, true)
    const onOpen = vi.fn<(place: Place) => void>()
    const { unmount } = render(<DissolveBar place={root} onOpen={onOpen} />)
    fireEvent.click(await screen.findByRole('button', { name: 'New address' }))
    const option = screen.getByRole('checkbox', { name: /Make an agent identity with it/ }) as HTMLInputElement
    expect(option.checked).toBe(true)
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'shop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make address' }))
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ workspace: DISSOLVE_WORKSPACE, folder: 'shop@dissolve.email' }))
    unmount()

    // The new address's folder opens with its identity showing.
    render(<DissolveBar place={{ workspace: DISSOLVE_WORKSPACE, folder: 'shop@dissolve.email' }} onOpen={onOpen} />)
    const card = await screen.findByRole('region', { name: 'Agent identity' })
    expect(within(card).getByRole('button', { name: 'Copy the Email' }).textContent).toContain('shop@dissolve.email')
    expect(await within(card).findByText('Ada Example')).toBeTruthy()
    expect(within(card).queryByText(/Pretend-Pass/)).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: /Show Password/i }))
    expect(await within(card).findByText(/^Pretend-Pass-0-/)).toBeTruthy()

    fireEvent.click(within(card).getByRole('button', { name: 'Regenerate' }))
    const dialog = screen.getByRole('dialog', { name: 'Regenerate this identity?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Regenerate' }))
    expect(await within(card).findByText('Noah Sample')).toBeTruthy()
    // A password shown before is forgotten, so the new one is shown only when asked for.
    expect(within(card).queryByText(/Pretend-Pass/)).toBeNull()
  })

  it('shows nothing of identities on a plan without them', async () => {
    const status = await connectDissolve()
    expect(status.identities.plan).toBe(false)
    const inbox = status.inboxes[0]?.address ?? ''
    render(<DissolveBar place={{ workspace: DISSOLVE_WORKSPACE, folder: inbox }} onOpen={() => undefined} />)
    await screen.findByRole('button', { name: 'Burn' })
    expect(screen.queryByRole('button', { name: 'Identity' })).toBeNull()
    cleanup()
    render(<DissolveBar place={root} onOpen={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: 'New address' }))
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Allow agent identities' })).toBeNull()
  })
})
