import { z } from 'zod'

import { CLOUDFLARE_API, CLOUDFLARE_TIMEOUT_MS } from '../constants'
import type { Bindings } from '../types'

/** One zone (domain) in the Cloudflare account. */
export interface Zone {
  id: string
  name: string
}

/** A zone's catch-all rule, as Cloudflare shapes it. Parsed from every answer, and from what the gateway stored. */
const catchAllSchema = z.object({
  enabled: z.boolean(),
  matchers: z.array(z.object({ type: z.string() })),
  actions: z.array(z.object({ type: z.string(), value: z.array(z.string()).optional() })),
})

/** A zone's catch-all rule: what happens to mail for an address no other rule names. */
export type CatchAll = z.infer<typeof catchAllSchema>

const zonesSchema = z.array(z.object({ id: z.string(), name: z.string() }))
const routingSchema = z.object({ enabled: z.boolean() })

/** Cloudflare's answer envelope, the parts the gateway reads. */
const envelopeSchema = z.object({
  success: z.boolean(),
  result: z.unknown(),
  result_info: z.object({ total_pages: z.number().optional() }).optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

/** The part of the Cloudflare API the gateway uses to route a domain's mail to itself. Tests swap in a fake. */
export interface CloudflareApi {
  zones(): Promise<Zone[]>
  routingEnabled(zoneId: string): Promise<boolean>
  enableRouting(zoneId: string): Promise<void>
  catchAll(zoneId: string): Promise<CatchAll>
  setCatchAll(zoneId: string, rule: CatchAll): Promise<void>
}

/** Thrown when Cloudflare refuses, fails, or answers in a shape the gateway does not know, with its words for the log. */
export class CloudflareError extends Error {}

/** How many zones one page of the zone list holds. An account with more is read page by page. */
const ZONES_PER_PAGE = 50

/** The catch-all that sends a zone's mail to this Worker. */
export function toWorker(workerName: string): CatchAll {
  return { enabled: true, matchers: [{ type: 'all' }], actions: [{ type: 'worker', value: [workerName] }] }
}

/** True when a catch-all already sends mail to this Worker. */
export function pointsAt(rule: CatchAll, workerName: string): boolean {
  return rule.enabled && rule.actions.some((action) => action.type === 'worker' && action.value?.includes(workerName) === true)
}

/** A catch-all in a few words, for the app: `forward a@b.com`, `worker buun-mail-gateway`, `drop`, `off`. */
export function describeCatchAll(rule: CatchAll): string {
  if (!rule.enabled) return 'off'
  return rule.actions.map((action) => [action.type, ...(action.value ?? [])].join(' ')).join(', ')
}

/** A catch-all the gateway stored as JSON, or null when the text is not one. */
export function parseCatchAll(text: string): CatchAll | null {
  try {
    const parsed = catchAllSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    // Not JSON at all: the stored value is unreadable, which the caller treats as no previous rule.
    return null
  }
}

/** Parses a result with its schema, or throws a Cloudflare error naming what changed. */
function shaped<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new CloudflareError(`Cloudflare answered ${what} in an unexpected shape`)
  return parsed.data
}

/**
 * The live API, or null without a token. In local development writes are skipped (and reads still happen) unless
 * `CLOUDFLARE_WRITES` is `on`, so trying the gateway on a laptop never redirects real mail.
 */
export function cloudflareFrom(env: Bindings): CloudflareApi | null {
  const token = env.CLOUDFLARE_API_TOKEN
  const account = env.CLOUDFLARE_ACCOUNT_ID
  if (token === undefined || token === '' || account === undefined || account === '') return null
  const writes = env.ENVIRONMENT !== 'dev' || env.CLOUDFLARE_WRITES === 'on'

  async function answer(path: string, init: RequestInit = {}): Promise<{ result: unknown; totalPages: number }> {
    const response = await fetch(`${CLOUDFLARE_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
    })
    const body = envelopeSchema.safeParse(await response.json().catch(() => null))
    if (!body.success) throw new CloudflareError(`HTTP ${response.status}`)
    if (!body.data.success) throw new CloudflareError(body.data.errors?.map((error) => error.message).join('; ') ?? `HTTP ${response.status}`)
    return { result: body.data.result, totalPages: body.data.result_info?.total_pages ?? 1 }
  }
  async function write(path: string, init: RequestInit): Promise<void> {
    if (writes) await answer(path, init)
  }
  const zonePath = (zoneId: string, rest: string) => `/zones/${encodeURIComponent(zoneId)}/email/routing${rest}`

  return {
    async zones() {
      const zones: Zone[] = []
      for (let page = 1; ; page += 1) {
        const { result, totalPages } = await answer(`/zones?account.id=${encodeURIComponent(account)}&per_page=${ZONES_PER_PAGE}&page=${page}`)
        zones.push(...shaped(zonesSchema, result, 'the zone list').map((zone) => ({ id: zone.id, name: zone.name.toLowerCase() })))
        if (page >= totalPages) return zones
      }
    },
    async routingEnabled(zoneId) {
      return shaped(routingSchema, (await answer(zonePath(zoneId, ''))).result, 'Email Routing settings').enabled
    },
    enableRouting(zoneId) {
      return write(zonePath(zoneId, '/enable'), { method: 'POST', body: '{}' })
    },
    async catchAll(zoneId) {
      return shaped(catchAllSchema, (await answer(zonePath(zoneId, '/rules/catch_all'))).result, 'a catch-all rule')
    },
    setCatchAll(zoneId, rule) {
      return write(zonePath(zoneId, '/rules/catch_all'), { method: 'PUT', body: JSON.stringify(rule) })
    },
  }
}
