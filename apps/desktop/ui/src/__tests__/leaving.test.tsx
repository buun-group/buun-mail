import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useLeaving } from '../hooks/useLeaving'

const keyOf = (item: string): string => item

describe('useLeaving', () => {
  it('keeps a removed item in its place, leaving, until it is gone', () => {
    const { result, rerender } = renderHook(({ items, scope }) => useLeaving(items, keyOf, scope), { initialProps: { items: ['a', 'b', 'c'], scope: 'inbox' } })
    rerender({ items: ['a', 'c'], scope: 'inbox' })
    expect(result.current.list.map((kept) => `${kept.key}${kept.leaving ? '-' : ''}`)).toEqual(['a', 'b-', 'c'])
    act(() => result.current.gone('b'))
    expect(result.current.list.map((kept) => kept.key)).toEqual(['a', 'c'])
  })

  it('replaces the list at once when the scope changes, and keeps a returning item', () => {
    const { result, rerender } = renderHook(({ items, scope }) => useLeaving(items, keyOf, scope), { initialProps: { items: ['a', 'b'], scope: 'inbox' } })
    rerender({ items: ['x'], scope: 'archive' })
    expect(result.current.list.map((kept) => kept.key)).toEqual(['x'])
    rerender({ items: [], scope: 'archive' })
    rerender({ items: ['x'], scope: 'archive' })
    expect(result.current.list).toEqual([{ item: 'x', key: 'x', leaving: false }])
  })

  it('does not loop on a list rebuilt every render', () => {
    const { result, rerender } = renderHook(() => useLeaving(['a', 'b'].map((item) => item), keyOf, 'inbox'))
    rerender()
    expect(result.current.list.map((kept) => kept.key)).toEqual(['a', 'b'])
  })
})
