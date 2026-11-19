import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { Message } from '../api/types'
import { App } from '../App'
import { sortMessages } from '../lib/sort'

const message = (id: string, fromName: string, subject: string, receivedAt: string): Message => ({
  id, workspace: 'w', folder: null, fromName, from: `${id}@x.com`, to: 'me@y.com', matched: null, folderMatched: null, subject, preview: '', receivedAt, unread: false, starred: false, shelf: 'active', tags: [], threadId: null, threadSize: 1, snoozedUntil: null, size: null, checks: null,
})

const LIST = [message('a', 'Zoe', 'apples', '2026-11-18T10:00:00Z'), message('b', 'adam', 'Bananas', '2026-11-19T10:00:00Z'), message('c', 'Mia', 'cherries', '2026-11-17T10:00:00Z')]

beforeAll(() => {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })
})

afterEach(cleanup)

describe('sortMessages', () => {
  it('orders by received, sender or subject, either way, ignoring case', () => {
    const ids = (key: 'from' | 'subject' | 'received', descending: boolean) => sortMessages(LIST, { key, descending }).map((item) => item.id)
    expect(ids('received', true)).toEqual(['b', 'a', 'c'])
    expect(ids('received', false)).toEqual(['c', 'a', 'b'])
    expect(ids('from', false)).toEqual(['b', 'c', 'a'])
    expect(ids('subject', true)).toEqual(['c', 'b', 'a'])
  })
})

describe('the column headers', () => {
  it('sort the list and turn the order round on a second click', async () => {
    render(<App />)
    const headers = await screen.findByRole('group', { name: 'Sort the list' })
    expect(within(headers).getByRole('button', { name: 'Received, sorted last to first' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(headers).getByRole('button', { name: 'Sort by From' }))
    expect(within(headers).getByRole('button', { name: 'From, sorted first to last' })).toBeTruthy()
    fireEvent.click(within(headers).getByRole('button', { name: 'From, sorted first to last' }))
    expect(within(headers).getByRole('button', { name: 'From, sorted last to first' })).toBeTruthy()
  })
})
