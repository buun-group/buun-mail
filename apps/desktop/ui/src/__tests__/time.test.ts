import { describe, expect, it } from 'vitest'

import { formatListed, formatReceived } from '../lib/time'

const NOW = new Date(2026, 10, 19, 12, 0)

describe('formatReceived', () => {
  it('shows the time for today', () => {
    expect(formatReceived(new Date(2026, 10, 19, 7, 42).toISOString(), NOW)).toMatch(/07.42|7.42/)
  })

  it('says yesterday for yesterday', () => {
    expect(formatReceived(new Date(2026, 10, 18, 23, 5).toISOString(), NOW)).toBe('Yesterday')
  })

  it('shows the date before that', () => {
    expect(formatReceived(new Date(2026, 10, 16, 10, 0).toISOString(), NOW)).toMatch(/16/)
  })
})

describe('formatListed', () => {
  it('shows the date and the time for this year', () => {
    const shown = formatListed(new Date(2026, 10, 19, 22, 40).toISOString(), NOW)
    expect(shown).toMatch(/19/)
    expect(shown).toMatch(/Nov/)
    expect(shown).toMatch(/10.40/)
  })

  it('shows the date with its year, without the time, for an earlier year', () => {
    const shown = formatListed(new Date(2025, 2, 3, 9, 15).toISOString(), NOW)
    expect(shown).toMatch(/2025/)
    expect(shown).not.toMatch(/9.15/)
  })
})
