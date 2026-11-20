import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UpdateInfo } from '../api/types'
import { STORAGE_KEYS, UPDATE_CHECK_DELAY_MS } from '../constants/ui'
import { useUpdateCheck } from '../hooks/useUpdateCheck'

const newer: UpdateInfo = { current: '0.4.0', latest: '0.5.0', newer: true, beta: false, url: 'https://github.com/buun-group/buun-mail/releases/tag/v0.5.0', asset: 'Buun.Mail_0.5.0_amd64.deb' }
const check = vi.fn<(early: boolean) => Promise<UpdateInfo>>()

vi.mock('../api/client', () => ({ checkForUpdate: (early: boolean) => check(early), installUpdate: () => Promise.resolve({ path: '/tmp/x', opens: true }) }))
vi.mock('../lib/feedback', () => ({ toast: () => 0 }))

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  check.mockReset()
  check.mockResolvedValue(newer)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the update check', () => {
  it('looks shortly after starting, and keeps the pop-up until it is dismissed for that version', async () => {
    const { result, unmount } = renderHook(() => useUpdateCheck(true, 'stable'))
    expect(result.current.prompting).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DELAY_MS)
    })
    expect(check).toHaveBeenCalledTimes(1)
    expect(result.current.found?.latest).toBe('0.5.0')
    expect(result.current.prompting).toBe(true)
    act(() => result.current.dismiss())
    expect(result.current.prompting).toBe(false)
    unmount()

    // A day later it looks again and finds the same version: dismissed, it stays away.
    const checked = JSON.parse(localStorage.getItem(STORAGE_KEYS.updateChecked) ?? '{}') as { told: string }
    expect(checked.told).toBe('0.5.0')
    localStorage.setItem(STORAGE_KEYS.updateChecked, JSON.stringify({ at: 0, told: checked.told }))
    const again = renderHook(() => useUpdateCheck(true, 'stable'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DELAY_MS)
    })
    expect(check).toHaveBeenCalledTimes(2)
    expect(again.result.current.prompting).toBe(false)

    // The next version asks again.
    check.mockResolvedValue({ ...newer, latest: '0.6.0' })
    await act(async () => {
      await again.result.current.checkNow()
    })
    expect(again.result.current.prompting).toBe(true)
  })

  it('never looks on its own when turned off, but Check now still works', async () => {
    const { result } = renderHook(() => useUpdateCheck(false, 'stable'))
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

  it('looks among betas at once when early releases are chosen', async () => {
    const { rerender } = renderHook(({ channel }: { channel: 'stable' | 'early' }) => useUpdateCheck(false, channel), { initialProps: { channel: 'stable' } })
    expect(check).not.toHaveBeenCalled()
    await act(async () => {
      rerender({ channel: 'early' })
      await Promise.resolve()
    })
    expect(check).toHaveBeenCalledWith(true)
  })
})
