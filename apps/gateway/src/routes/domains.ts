import { createRoute, z } from '@hono/zod-openapi'

import { DOMAIN_ROUTES } from '../constants'
import { requireMailbox } from '../lib/auth'
import type { GatewayVariables } from '../lib/auth'
import { BEARER_SECURITY, errorResponse, router } from '../lib/openapi'
import { addDomain, addRelayedDomain, availableZones, listDomains, removeDomain } from '../services/domains'

/** The shortest and longest domain names the API reads before the service checks the shape. */
const DOMAIN_MIN = 3
const DOMAIN_MAX = 253

const OwnedDomainSchema = z
  .object({
    domain: z.string().openapi({ example: 'acme.example' }),
    via: z.enum(DOMAIN_ROUTES),
    routedHere: z.boolean().nullable().openapi({ description: "Whether the zone's catch-all points here; null when the gateway cannot ask Cloudflare" }),
    previously: z.string().nullable().openapi({ description: 'What the catch-all did before, restored on removal' }),
  })
  .openapi('OwnedDomain')

const AvailableZoneSchema = z.object({ domain: z.string(), catchAllNow: z.string().openapi({ example: 'forward owner@mail.example' }) }).openapi('AvailableZone')
const AddDomainBodySchema = z.object({ domain: z.string().min(DOMAIN_MIN).max(DOMAIN_MAX), via: z.enum(DOMAIN_ROUTES).default('catch_all') }).openapi('AddDomainBody')

/**
 * @route GET /v1/domains
 * @summary List the domains this mailbox owns.
 * @tags Domains
 * @auth Bearer
 * @returns {OwnedDomain} 200 - The domains, each with whether its mail really reaches the gateway.
 * @returns {ErrorResponseSchema} 401 - No valid mailbox token.
 */
const listDomainsRoute = createRoute({
  method: 'get',
  path: '/domains',
  middleware: [requireMailbox] as const,
  responses: {
    200: { content: { 'application/json': { schema: z.object({ domains: z.array(OwnedDomainSchema) }) } }, description: 'The domains' },
    401: errorResponse('No valid mailbox token'),
  },
  tags: ['Domains'],
  security: BEARER_SECURITY,
})

/**
 * @route GET /v1/domains/available
 * @summary List the zones this mailbox could claim.
 * @description Zones in the gateway's Cloudflare account that no mailbox owns, with what each catch-all does now.
 * @tags Domains
 * @auth Bearer
 * @returns {AvailableZone} 200 - The zones.
 * @returns {ErrorResponseSchema} 401 - No valid mailbox token.
 * @returns {ErrorResponseSchema} 502 - Cloudflare refused or failed.
 * @returns {ErrorResponseSchema} 503 - The gateway has no Cloudflare token.
 */
const availableZonesRoute = createRoute({
  method: 'get',
  path: '/domains/available',
  middleware: [requireMailbox] as const,
  responses: {
    200: { content: { 'application/json': { schema: z.object({ zones: z.array(AvailableZoneSchema) }) } }, description: 'The zones' },
    401: errorResponse('No valid mailbox token'),
    502: errorResponse('Cloudflare refused or failed'),
    503: errorResponse('The gateway has no Cloudflare token'),
  },
  tags: ['Domains'],
  security: BEARER_SECURITY,
})

/**
 * @route POST /v1/domains
 * @summary Give this mailbox a domain.
 * @description With `via: catch_all` (the default), claims a zone in the gateway's account: turns Email Routing on if
 *              needed, keeps the old catch-all and points it here. With `via: relay`, records a domain from another
 *              account whose relay hands its mail over, changing nothing in Cloudflare.
 * @tags Domains
 * @auth Bearer
 * @param {AddDomainBody} body.body.required - The domain and how its mail arrives.
 * @returns {OwnedDomain} 201 - The domain was added.
 * @returns {ErrorResponseSchema} 400 - The domain is not valid.
 * @returns {ErrorResponseSchema} 401 - No valid mailbox token.
 * @returns {ErrorResponseSchema} 404 - The zone is not in the gateway's account.
 * @returns {ErrorResponseSchema} 409 - A mailbox already owns the domain.
 * @returns {ErrorResponseSchema} 502 - Cloudflare refused the change.
 * @returns {ErrorResponseSchema} 503 - The gateway has no Cloudflare token.
 */
const addDomainRoute = createRoute({
  method: 'post',
  path: '/domains',
  middleware: [requireMailbox] as const,
  request: { body: { content: { 'application/json': { schema: AddDomainBodySchema } }, required: true } },
  responses: {
    201: { content: { 'application/json': { schema: z.object({ domain: OwnedDomainSchema }) } }, description: 'The domain was added' },
    400: errorResponse('The domain is not valid'),
    401: errorResponse('No valid mailbox token'),
    404: errorResponse("The zone is not in the gateway's account"),
    409: errorResponse('A mailbox already owns the domain'),
    502: errorResponse('Cloudflare refused the change'),
    503: errorResponse('The gateway has no Cloudflare token'),
  },
  tags: ['Domains'],
  security: BEARER_SECURITY,
})

/**
 * @route DELETE /v1/domains/:domain
 * @summary Take a domain from this mailbox.
 * @description When its catch-all still points here, the catch-all the gateway replaced is put back, or switched off
 *              when there was none.
 * @tags Domains
 * @auth Bearer
 * @param {string} domain.path.required - The domain.
 * @returns {void} 204 - The domain was removed.
 * @returns {ErrorResponseSchema} 401 - No valid mailbox token.
 * @returns {ErrorResponseSchema} 404 - The domain is not this mailbox's.
 * @returns {ErrorResponseSchema} 502 - Cloudflare refused the change.
 */
const removeDomainRoute = createRoute({
  method: 'delete',
  path: '/domains/{domain}',
  middleware: [requireMailbox] as const,
  request: { params: z.object({ domain: z.string() }) },
  responses: {
    204: { description: 'The domain was removed' },
    401: errorResponse('No valid mailbox token'),
    404: errorResponse("The domain is not this mailbox's"),
    502: errorResponse('Cloudflare refused the change'),
  },
  tags: ['Domains'],
  security: BEARER_SECURITY,
})

/** Domain management for the mailbox the token opens: what it owns, what it could own, add, remove. */
export const domains = router<{ Variables: GatewayVariables }>()
  .openapi(listDomainsRoute, async (c) => c.json({ domains: await listDomains(c.get('runtime'), c.get('mailbox').id) }, 200))
  .openapi(availableZonesRoute, async (c) => c.json({ zones: await availableZones(c.get('runtime')) }, 200))
  .openapi(addDomainRoute, async (c) => {
    const body = c.req.valid('json')
    const add = body.via === 'relay' ? addRelayedDomain : addDomain
    return c.json({ domain: await add(c.get('runtime'), c.get('mailbox').id, body.domain) }, 201)
  })
  .openapi(removeDomainRoute, async (c) => {
    await removeDomain(c.get('runtime'), c.get('mailbox').id, c.req.valid('param').domain)
    return c.body(null, 204)
  })
