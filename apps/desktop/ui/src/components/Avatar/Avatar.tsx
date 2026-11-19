import type { ReactNode } from 'react'

import { BUUN_GROUP, PRODUCTS } from '../../constants/products'
import type { Theme } from '../../constants/ui'

import './Avatar.css'

/** How many tints `tokens.css` defines for avatars (`--avatar-1` to `--avatar-6`). */
const TINTS = 6

/** The Buun Group marks a sender's domain earns, from the products' own sites. Nothing is fetched: privacy first. */
const MARKS: ReadonlyMap<string, { light: string; dark: string }> = new Map([
  [new URL(BUUN_GROUP.href).hostname, BUUN_GROUP.logo],
  ...PRODUCTS.map((product) => [new URL(product.href).hostname.replace(/^www\./u, ''), product.mark] as const),
])

/** Up to two initials from a display name, or the address when there is no name. */
export function initials(name: string, address: string): string {
  const words = (name.trim() || address.split('@')[0] || '?').split(/[\s._-]+/u).filter(Boolean)
  const letters = words.length > 1 ? `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}` : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

/** A steady tint for an address, so the same sender always looks the same. */
function tintFor(address: string): number {
  let hash = 0
  for (const char of address.toLowerCase()) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return (hash % TINTS) + 1
}

/** A sender's face: their Buun Group product mark when they write from one, otherwise their initials on a soft tint. */
export function Avatar({ name, address, theme, size = 'md' }: { name: string; address: string; theme: Theme; size?: 'md' | 'lg' }): ReactNode {
  const domain = address.split('@')[1]?.toLowerCase() ?? ''
  const mark = MARKS.get(domain)
  if (mark !== undefined) return <img className={`avatar avatar--${size} avatar--mark`} src={mark[theme]} alt="" aria-hidden="true" />
  return (
    <span className={`avatar avatar--${size}`} data-tint={tintFor(address)} aria-hidden="true">
      {initials(name, address)}
    </span>
  )
}
