import { describe, expect, it } from 'vitest'

import { formatReceived } from '../lib/time'

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
