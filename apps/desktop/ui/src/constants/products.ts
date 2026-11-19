/**
 * The Buun Group products this client shows, in the words buungroup.com uses for them
 * (`buungroup-app/apps/site/src/locales/en/products.json`). Destroy Network appears as dissolve.email, its rebrand.
 * A product added here also gets its site in `src-tauri/capabilities/default.json`, or the app cannot open it; a test
 * holds the two in step.
 */

export const PRODUCT_IDS = ['plotwork', 'flung', 'gunspec', 'dissolve', 'cryptflare'] as const

export type ProductId = (typeof PRODUCT_IDS)[number]

export interface Product {
  id: ProductId
  name: string
  kind: string
  heading: readonly [string, string]
  body: string
  points: readonly string[]
  href: string
  mark: { light: string; dark: string }
}

export const PRODUCTS: readonly Product[] = [
  {
    id: 'plotwork',
    name: 'Plotwork',
    kind: 'Diagrams as code',
    heading: ['Draw it once.', 'Keep it true.'],
    body: 'Write a diagram in a few lines of text and Plotwork draws it, checks it in your CI and tells you when it drifts from the code it describes.',
    points: ['Twenty kinds of diagram', 'A drift check on every pull request', 'A live whiteboard and an MCP server'],
    href: 'https://plotwork.dev',
    mark: { light: '/products/plotwork.svg', dark: '/products/plotwork.svg' },
  },
  {
    id: 'flung',
    name: 'Flung',
    kind: 'Social publishing API',
    heading: ['Every network.', 'One API.'],
    body: 'Your app or AI agent connects social accounts, then schedules and publishes posts to 27 networks through one REST API, an SDK or an MCP server.',
    points: ['27 networks, one request', 'A TypeScript SDK and webhooks', 'An MCP server for agents'],
    href: 'https://flung.dev',
    mark: { light: '/products/flung.svg', dark: '/products/flung-dark.svg' },
  },
  {
    id: 'gunspec',
    name: 'GunSpec',
    kind: 'Firearm data API',
    heading: ['Every figure,', 'sourced.'],
    body: 'Specifications for more than 8,500 firearms, with calibers, ammunition and what fits what, every figure traced to where it came from.',
    points: ['8,500 and more firearms', 'Calibers, loads and fitment', 'An API and an MCP server'],
    href: 'https://gunspec.io',
    mark: { light: '/products/gunspec.png', dark: '/products/gunspec-dark.png' },
  },
  {
    id: 'dissolve',
    name: 'dissolve.email',
    kind: 'Disposable email',
    heading: ['An inbox', 'that forgets.'],
    body: 'A disposable address in one click, for the sign-up you do not trust. Use it in the browser, from the extension or through the API, and let it go when you are done.',
    points: ['An address in one click', 'A browser extension', 'An API for your tests'],
    href: 'https://dissolve.email',
    mark: { light: '/products/dissolve.svg', dark: '/products/dissolve-dark.svg' },
  },
  {
    id: 'cryptflare',
    name: 'CryptFlare',
    kind: 'Secrets management',
    heading: ['Secrets,', 'sealed at the edge.'],
    body: 'Encrypted, versioned secrets with fine-grained access for teams, built on Cloudflare and run for you as a managed service.',
    points: ['Encrypted and versioned', 'Access by person and by project', 'Run for you on the edge'],
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
