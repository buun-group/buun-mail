import { describe, expect, it } from 'vitest'

import type { Message, Workspace } from '../api/types'
import { forwardSubject, fromChoices, parseContact, quote, replyAllCc, replySubject, replyTarget, startingText } from '../lib/compose'

const message: Message = {
  id: 'm1', workspace: 'flung', folder: null, fromName: 'A client', from: 'c@client.example', to: 'buun-mail@flung.dev', matched: '*@flung.dev', folderMatched: null,
  subject: 'Quote', preview: '', receivedAt: '2026-11-19T07:42:00Z', unread: false, starred: false, shelf: 'active', tags: [],
}
const workspaces: Workspace[] = [
  { id: 'flung', name: 'Flung', icon: null, addresses: ['*@flung.dev', 'hello@flung.dev'], folders: [], unread: 0 },
  { id: 'gun', name: 'GunSpec', icon: null, addresses: ['support@gunspec.io'], folders: [], unread: 0 },
]
const original = { message, body: 'Line one\n\nLine two', recipients: { to: [{ name: null, address: 'buun-mail@flung.dev' }, { name: 'Ops', address: 'ops@client.example' }], cc: [{ name: null, address: 'c@client.example' }], replyTo: [] } }

describe('compose helpers', () => {
  it('reads contacts as people type them', () => {
    expect(parseContact('Ada <Ada@Example.com>')).toEqual({ name: 'Ada', address: 'ada@example.com' })
    expect(parseContact('"Ops Team" <ops@x.io>,')).toEqual({ name: 'Ops Team', address: 'ops@x.io' })
    expect(parseContact('plain@x.io')).toEqual({ name: null, address: 'plain@x.io' })
    expect(parseContact('not an address')).toBeNull()
  })

  it('makes subjects without stacking prefixes', () => {
    expect(replySubject('Quote')).toBe('Re: Quote')
    expect(replySubject('RE: Quote')).toBe('RE: Quote')
    expect(forwardSubject('Fw: Quote')).toBe('Fw: Quote')
    expect(forwardSubject('Quote')).toBe('Fwd: Quote')
  })

  it('quotes the original under a line naming who wrote it', () => {
    const quoted = quote(original, (when, who) => `On ${when}, ${who} wrote:`)
    expect(quoted).toContain('A client <c@client.example> wrote:')
    expect(quoted).toContain('> Line one\n>\n> Line two')
  })

  it('starts with room to write, then the signature, then the quote', () => {
    expect(startingText('Sacha', '> hi')).toBe('\n\n-- \nSacha\n\n> hi')
    expect(startingText('', '')).toBe('')
  })

  it('offers the address the mail was sent to first, then sendable workspace addresses', () => {
    const choices = fromChoices(workspaces, [{ domain: 'flung.dev', signature: '' }], original)
    expect(choices.map((choice) => choice.address)).toEqual(['buun-mail@flung.dev', 'hello@flung.dev'])
    expect(choices[0]?.name).toBe('Flung')
  })

  it('replies all to everyone else, never to yourself twice', () => {
    expect(replyTarget(original).map((person) => person.address)).toEqual(['c@client.example'])
    expect(replyAllCc(original, 'buun-mail@flung.dev').map((person) => person.address)).toEqual(['ops@client.example'])
  })
})
