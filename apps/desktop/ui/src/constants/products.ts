import type { ParseKeys } from 'i18next'

/**
 * The Buun Group products this client shows, in the words buungroup.com uses for them
 * (`buungroup-app/apps/site/src/locales/en/products.json`). Destroy Network appears as dissolve.email, its rebrand.
 * The words are translation keys into `locales/<language>/products.json`, resolved with `t()` where they show.
 * A product added here also gets its site in `src-tauri/capabilities/default.json`, or the app cannot open it; a test
 * holds the two in step.
 */

export const PRODUCT_IDS = ['plotwork', 'flung', 'gunspec', 'dissolve', 'cryptflare'] as const

export type ProductId = (typeof PRODUCT_IDS)[number]

/** A key in the `products` strings. The words live in `locales/<language>/products.json`; names and links stay here. */
export type ProductKey = ParseKeys<'products'>

export interface Product {
  id: ProductId
  name: string
  kind: ProductKey
  heading: readonly [ProductKey, ProductKey]
  body: ProductKey
  points: readonly ProductKey[]
  href: string
  mark: { light: string; dark: string }
}

export const PRODUCTS: readonly Product[] = [
  {
    id: 'plotwork',
    name: 'Plotwork',
    kind: 'plotwork.kind',
    heading: ['plotwork.heading.first', 'plotwork.heading.second'],
    body: 'plotwork.body',
    points: ['plotwork.points.first', 'plotwork.points.second', 'plotwork.points.third'],
    href: 'https://plotwork.dev',
    mark: { light: '/products/plotwork.svg', dark: '/products/plotwork.svg' },
  },
  {
    id: 'flung',
    name: 'Flung',
    kind: 'flung.kind',
    heading: ['flung.heading.first', 'flung.heading.second'],
    body: 'flung.body',
    points: ['flung.points.first', 'flung.points.second', 'flung.points.third'],
    href: 'https://flung.dev',
    mark: { light: '/products/flung.svg', dark: '/products/flung-dark.svg' },
  },
  {
    id: 'gunspec',
    name: 'GunSpec',
    kind: 'gunspec.kind',
    heading: ['gunspec.heading.first', 'gunspec.heading.second'],
    body: 'gunspec.body',
    points: ['gunspec.points.first', 'gunspec.points.second', 'gunspec.points.third'],
    href: 'https://gunspec.io',
    mark: { light: '/products/gunspec.png', dark: '/products/gunspec-dark.png' },
  },
  {
    id: 'dissolve',
    name: 'dissolve.email',
    kind: 'dissolve.kind',
    heading: ['dissolve.heading.first', 'dissolve.heading.second'],
    body: 'dissolve.body',
    points: ['dissolve.points.first', 'dissolve.points.second', 'dissolve.points.third'],
    href: 'https://dissolve.email',
    mark: { light: '/products/dissolve.svg', dark: '/products/dissolve-dark.svg' },
  },
  {
    id: 'cryptflare',
    name: 'CryptFlare',
    kind: 'cryptflare.kind',
    heading: ['cryptflare.heading.first', 'cryptflare.heading.second'],
    body: 'cryptflare.body',
    points: ['cryptflare.points.first', 'cryptflare.points.second', 'cryptflare.points.third'],
    href: 'https://cryptflare.com',
    mark: { light: '/products/cryptflare.png', dark: '/products/cryptflare-dark.png' },
  },
]


/** Buun Group itself: the footer's logo, which opens the group site. */
export const BUUN_GROUP = {
  name: 'Buun Group',
  href: 'https://buungroup.com',
  logo: { light: '/buun-group.svg', dark: '/buun-group-dark.svg' },
} as const

/**
 * The Buun Group marks a workspace or folder can wear, by the key the routing file uses (`icon = "plotwork"`): the
 * group's own logo and every product's mark.
 */
export const BRAND_ICONS = {
  buun: { name: BUUN_GROUP.name, mark: BUUN_GROUP.logo },
  ...Object.fromEntries(PRODUCTS.map((product) => [product.id, { name: product.name, mark: product.mark }])),
} as Record<'buun' | ProductId, { name: string; mark: { light: string; dark: string } }>

export type BrandIcon = keyof typeof BRAND_ICONS

/** True when a key names a Buun Group mark. */
export function isBrandIcon(key: string | null | undefined): key is BrandIcon {
  return key !== null && key !== undefined && Object.hasOwn(BRAND_ICONS, key)
}
