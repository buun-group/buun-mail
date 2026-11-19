import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { Select } from '../components/Select/Select'

const OPTIONS = [
  { value: 'buungroup.com', label: 'buungroup.com', hint: 'forward groupbuun@gmail.com' },
  { value: 'flung.dev', label: 'flung.dev' },
  { value: 'dissolve.email', label: 'dissolve.email' },
]

function Harness() {
  const [value, setValue] = useState('')
  return (
    <>
      <label htmlFor="domain">Domain</label>
      <Select id="domain" value={value} options={OPTIONS} placeholder="Choose a domain" onChange={setValue} />
      <output>{value}</output>
    </>
  )
}

beforeAll(() => {
  // jsdom lays nothing out, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(cleanup)

describe('Select', () => {
  it('shows the placeholder, opens a list on click, and chooses with the pointer', () => {
    render(<Harness />)
    const trigger = screen.getByRole('combobox', { name: 'Domain' })
    expect(trigger.textContent).toBe('Choose a domain')
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getByText('forward groupbuun@gmail.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /flung\.dev/ }))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger.textContent).toBe('flung.dev')
  })

  it('moves with arrow keys, chooses with Enter, closes with Escape, and jumps by first letter', () => {
    render(<Harness />)
    const trigger = screen.getByRole('combobox', { name: 'Domain' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('flung.dev')
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.keyDown(trigger, { key: 'd' })
    expect(trigger.textContent).toBe('dissolve.email')
  })
})
