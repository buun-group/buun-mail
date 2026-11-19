/** A piece of a message's text: plain words, or something worth copying or opening on its own. */
export type Token = { kind: 'text'; text: string } | { kind: 'link' | 'email' | 'code'; text: string }

export type CopyKind = Exclude<Token['kind'], 'text'>

/**
 * Links, then email addresses, then codes: a word of five or more letters, digits and dashes holding at least one digit
 * (`test12345`, `INV-2026-11`, `482913`). Order matters: a link or an address is never split into codes.
 */
const PATTERN = /(https?:\/\/[^\s<>"']+)|([\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,})|(\b(?=[\w-]*\d)[a-z\d][\w-]{3,}[a-z\d]\b)/giu

/** Punctuation that usually ends a sentence rather than a link: `see https://x.dev.` */
const TRAILING = /[.,;:!?)\]]+$/u

/** Splits text into plain runs and the links, addresses and codes in it, in order. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  const push = (token: Token): void => {
    const last = tokens.at(-1)
    if (token.kind === 'text' && last?.kind === 'text') last.text += token.text
    else if (token.text !== '') tokens.push(token)
  }
  for (const match of text.matchAll(PATTERN)) {
    const start = match.index
    let found = match[0]
    const kind: CopyKind = match[1] !== undefined ? 'link' : match[2] !== undefined ? 'email' : 'code'
    let tail = ''
    if (kind === 'link') {
      tail = TRAILING.exec(found)?.[0] ?? ''
      found = found.slice(0, found.length - tail.length)
    }
    push({ kind: 'text', text: text.slice(at, start) })
    push({ kind, text: found })
    push({ kind: 'text', text: tail })
    at = start + match[0].length
  }
  push({ kind: 'text', text: text.slice(at) })
  return tokens
}
