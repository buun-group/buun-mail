import { describe, expect, it } from 'vitest'

import { tokenize } from '../lib/tokens'

describe('tokenize', () => {
  it('finds links, addresses and codes, leaving the words around them', () => {
    expect(tokenize('Your code is 482913. Reply to help@acme.dev or see https://acme.dev/help.')).toEqual([
      { kind: 'text', text: 'Your code is ' },
      { kind: 'code', text: '482913' },
      { kind: 'text', text: '. Reply to ' },
      { kind: 'email', text: 'help@acme.dev' },
      { kind: 'text', text: ' or see ' },
      { kind: 'link', text: 'https://acme.dev/help' },
      { kind: 'text', text: '.' },
    ])
  })

  it('takes words with digits as codes but leaves plain words and short numbers alone', () => {
    expect(tokenize('test12345 and INV-2026-11 on day 12 of hello')).toEqual([
      { kind: 'code', text: 'test12345' },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: 'INV-2026-11' },
      { kind: 'text', text: ' on day 12 of hello' },
    ])
  })

  it('never splits an address or a link into codes', () => {
    expect(tokenize('user2026@mail.example https://x.dev/a1b2c3d4').map((token) => token.kind)).toEqual(['email', 'text', 'link'])
  })
})
