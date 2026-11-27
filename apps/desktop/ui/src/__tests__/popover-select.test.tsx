import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { Popover } from '../components/Popover/Popover'
import { Select } from '../components/Select/Select'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(cleanup)

function Picker({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const [domain, setDomain] = useState('dissolve.email')
  return (
    <Popover anchor={anchor} label="New address" onClose={onClose}>
      <Select id="domain" value={domain} options={['dissolve.email', '8374582.xyz'].map((value) => ({ value, label: value }))} onChange={setDomain} />
    </Popover>
  )
}

describe('a drop-down inside a popover', () => {
  it('chooses an option without closing the popover, and a click elsewhere still closes it', () => {
    const anchor = document.createElement('button')
    document.body.append(anchor)
    const onClose = vi.fn()
    render(<Picker anchor={anchor} onClose={onClose} />)

    fireEvent.click(screen.getByRole('combobox'))
    const option = screen.getByRole('option', { name: '8374582.xyz' })
    fireEvent.pointerDown(option)
    fireEvent.click(option)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox').textContent).toContain('8374582.xyz')

    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledOnce()
    anchor.remove()
  })
})
