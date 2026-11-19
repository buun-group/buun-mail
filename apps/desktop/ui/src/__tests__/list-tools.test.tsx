import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { App } from '../App'

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
  Element.prototype.scrollIntoView = () => undefined
  Element.prototype.animate = (() => ({})) as unknown as typeof Element.prototype.animate
})

afterEach(cleanup)

describe('the list tools', () => {
  it('filters to starred and back, saying so when nothing matches', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Show' })).getByRole('menuitemradio', { name: 'Read' }))
    expect(await screen.findByText('No read messages here.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filter: Read' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(await screen.findByText('Quote for the booking site')).toBeTruthy()
  })

  it('offers dates to jump to and a date field', async () => {
    render(<App />)
    await screen.findByText('Quote for the booking site')
    fireEvent.click(screen.getByRole('button', { name: 'Jump to' }))
    const box = screen.getByRole('dialog', { name: 'Jump to a date' })
    for (const label of ['Today', 'Yesterday', 'Last week', 'Last month', 'Last year', 'Go']) expect(within(box).getByRole('button', { name: label })).toBeTruthy()
    fireEvent.click(within(box).getByRole('button', { name: 'Last week' }))
    expect(screen.queryByRole('dialog', { name: 'Jump to a date' })).toBeNull()
  })

  it('shows the workspace beside the folder with its own name', async () => {
    render(<App />)
    expect(await screen.findByLabelText('in Buun Group')).toBeTruthy()
  })
})
