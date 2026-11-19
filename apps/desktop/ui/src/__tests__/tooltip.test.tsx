import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TipButton } from '../components/Tooltip/TipButton'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TipButton', () => {
  it('shows its tip in the page body after the pointer rests, and hides it on leave', () => {
    vi.useFakeTimers()
    render(<TipButton tip="Settings" aria-label="Settings" />)
    const button = screen.getByRole('button', { name: 'Settings' })
    fireEvent.mouseEnter(button)
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => vi.advanceTimersByTime(500))
    const tip = screen.getByRole('tooltip')
    expect(tip.parentElement).toBe(document.body)
    expect(button.getAttribute('aria-describedby')).toBe(tip.id)
    fireEvent.mouseLeave(button)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows nothing when the tip is null', () => {
    vi.useFakeTimers()
    render(<TipButton tip={null} aria-label="Inbox" />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Inbox' }))
    act(() => vi.advanceTimersByTime(500))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
