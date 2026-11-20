import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UpdateInfo } from '../api/types'
import { STORAGE_KEYS, UPDATE_CHECK_DELAY_MS } from '../constants/ui'
import { useUpdateCheck } from '../hooks/useUpdateCheck'

const newer: UpdateInfo = { current: '0.4.0', latest: '0.5.0', newer: true, url: 'https://github.com/buun-group/buun-mail/releases/tag/v0.5.0', publishedAt: null }
const check = vi.fn<() => Promise<UpdateInfo>>()

const told = vi.fn<(feedback: { text: string }) => number>()

vi.mock('../api/client', () => ({ checkForUpdate: () => check() }))
vi.mock('../lib/feedback', () => ({ toast: (feedback: { text: string }) => told(feedback) }))

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  check.mockReset()
  told.mockReset()
  check.mockResolvedValue(newer)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the update check', () => {
  it('looks shortly after starting and tells about a new version once', async () => {
    const { result, unmount } = renderHook(() => useUpdateCheck(true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DELAY_MS)
    })
    expect(check).toHaveBeenCalledTimes(1)
    expect(result.current.found?.latest).toBe('0.5.0')
    expect(told.mock.calls.map(([feedback]) => feedback.text)).toEqual(['Buun Mail 0.5.0 is out'])
    unmount()

    // A day later it looks again, but 0.5.0 was already announced.
    const checked = JSON.parse(localStorage.getItem(STORAGE_KEYS.updateChecked) ?? '{}') as { told: string }
    localStorage.setItem(STORAGE_KEYS.updateChecked, JSON.stringify({ at: 0, told: checked.told }))
    renderHook(() => useUpdateCheck(true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DELAY_MS)
    })
    expect(check).toHaveBeenCalledTimes(2)
    expect(told).toHaveBeenCalledTimes(1)
  })

  it('never looks on its own when turned off, but Check now still works', async () => {
    const { result } = renderHook(() => useUpdateCheck(false))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DELAY_MS * 2)
    })
    expect(check).not.toHaveBeenCalled()
    check.mockRejectedValueOnce('No release has been published yet.')
    await act(async () => {
      await result.current.checkNow().catch(() => undefined)
    })
    expect(result.current.problem).toBe('No release has been published yet.')
  })
})
