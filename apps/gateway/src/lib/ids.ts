/**
 * Public ids: a short prefix that says what the thing is, then 24 characters of Crockford base32. The prefix makes a
 * leaked or mistyped id readable in a log, and 120 random bits make a guess pointless.
 */

/** The prefix of each kind of record. The migrations check these shapes. */
export const ID_PREFIXES = {
  mailbox: 'mbx_',
  mailMessage: 'mml_',
  mailRelay: 'rly_',
} as const

/** One kind of record that has an id. */
export type IdKind = keyof typeof ID_PREFIXES

/** Crockford base32, lower case: no i, l, o or u, so an id reads back without confusion. */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** How many random characters follow the prefix. */
const RANDOM_LENGTH = 24

/** The mask that takes a byte to an index into the 32-letter alphabet. */
const ALPHABET_MASK = 31

/** A new id of a kind, from the platform's random source. */
export function newId(kind: IdKind): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_LENGTH))
  let out = ''
  for (const byte of bytes) out += ALPHABET.charAt(byte & ALPHABET_MASK)
  return `${ID_PREFIXES[kind]}${out}`
}
