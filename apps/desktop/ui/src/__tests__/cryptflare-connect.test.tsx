import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { disconnectCryptflare } from '../api/client'
import { CryptFlareConnect } from '../components/cryptflare/cryptflare-connect'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(async () => {
  cleanup()
  await disconnectCryptflare()
})

/** Opens a drop-down once its options have loaded (an empty one does not open) and picks one. */
const choose = async (field: string, option: string): Promise<void> => {
  const item = await waitFor(() => {
    if (screen.queryByRole('listbox') === null) fireEvent.click(screen.getByRole('combobox', { name: field }))
    return screen.getByRole('option', { name: option })
  })
  fireEvent.pointerDown(item)
  fireEvent.click(item)
}

const toggle = (): HTMLInputElement => screen.getByRole('switch', { name: 'Save agent identities automatically' }) as HTMLInputElement

describe('CryptFlare in Settings', () => {
  it('connects, chooses where saves go, then turns on saving identities', async () => {
    let connected = false
    render(<CryptFlareConnect onConnected={(next) => (connected = next)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Connect CryptFlare' }))
    expect(await screen.findByRole('heading', { name: 'Buun Group' })).toBeTruthy()
    expect(connected).toBe(true)

    expect(toggle().disabled).toBe(true)
    expect(screen.getByText('Choose where saves go first.')).toBeTruthy()

    await choose('Workspace', 'Agents')
    await choose('Environment', 'Identities')
    await waitFor(() => expect(toggle().disabled).toBe(false))
    fireEvent.click(toggle())
    await waitFor(() => expect(toggle().checked).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Save them now' }))
    expect(await screen.findByText(/^Last saved /)).toBeTruthy()
  })
})
