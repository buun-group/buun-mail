/** Random tokens and the hashes they are kept as. Only the Web Crypto API, so it runs in a Worker and in Node alike. */

const encoder = new TextEncoder()

/** Bytes as lower case hex. */
export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

/** `bytes` random bytes as lower case hex, from the platform's random source. */
export function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** The SHA-256 of a string, as lower case hex. This is how every token and relay key is kept at rest. */
export async function sha256Hex(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}
