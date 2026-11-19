import { describe, expect, it } from 'vitest'

import { snoozeTime } from '../lib/snooze'

describe('snoozeTime', () => {
  const thursday = new Date(2026, 10, 19, 10, 30)
  it('offers later today, tomorrow morning, Saturday and Monday', () => {
    expect(snoozeTime('laterToday', thursday)).toEqual(new Date(2026, 10, 19, 13, 0))
    expect(snoozeTime('tomorrow', thursday)).toEqual(new Date(2026, 10, 20, 8, 0))
    expect(snoozeTime('weekend', thursday)).toEqual(new Date(2026, 10, 21, 9, 0))
    expect(snoozeTime('nextWeek', thursday)).toEqual(new Date(2026, 10, 23, 8, 0))
  })

  it('turns a late Later today into tomorrow morning, and a weekend Saturday into next Saturday', () => {
    expect(snoozeTime('laterToday', new Date(2026, 10, 19, 16, 10))).toEqual(new Date(2026, 10, 20, 8, 0))
    expect(snoozeTime('weekend', new Date(2026, 10, 21, 11, 0))).toEqual(new Date(2026, 10, 28, 9, 0))
    expect(snoozeTime('nextWeek', new Date(2026, 10, 23, 9, 0))).toEqual(new Date(2026, 10, 30, 8, 0))
  })
})
