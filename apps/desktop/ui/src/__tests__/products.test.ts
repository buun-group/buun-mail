// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PRODUCT_IDS, PRODUCTS } from '../constants/products'

const UI = fileURLToPath(new URL('../../', import.meta.url))
const CAPABILITY = fileURLToPath(new URL('../../../src-tauri/capabilities/default.json', import.meta.url))

interface Capability {
  permissions: (string | { identifier: string; allow: { url: string }[] })[]
}

function allowedUrls(): string[] {
  const capability = JSON.parse(readFileSync(CAPABILITY, 'utf8')) as Capability
  return capability.permissions.flatMap((permission) => (typeof permission === 'string' || permission.identifier !== 'opener:allow-open-url' ? [] : permission.allow.map((entry) => entry.url)))
}

describe('the products shown', () => {
  it('lists every product once, in id order', () => {
    expect(PRODUCTS.map((product) => product.id)).toEqual([...PRODUCT_IDS])
  })

  it.each(PRODUCTS)('$name has its marks on disk', (product) => {
    for (const mark of Object.values(product.mark)) expect(existsSync(`${UI}public${mark}`), mark).toBe(true)
  })

  it.each(PRODUCTS)('$name links to an https site the desktop app may open', (product) => {
    expect(new URL(product.href).protocol).toBe('https:')
    expect(allowedUrls()).toContain(product.href)
  })

  it.each(PRODUCTS)('$name carries no em dash', (product) => {
    expect(JSON.stringify(product)).not.toContain(String.fromCodePoint(0x2014))
  })
})
