import { createRoute, z } from '@hono/zod-openapi'
import { createMiddleware } from 'hono/factory'

import { ERROR_CODES, MAX_MESSAGE_BYTES, REFUSALS } from '../constants'
import { ApiError } from '../lib/api-error'
import { bearerOf } from '../lib/auth'
import type { RequestVariables } from '../lib/auth'
import { BEARER_SECURITY, errorResponse, router } from '../lib/openapi'
import { receive } from '../services/messages'
import { mailboxOwnsAddress, relayForKey } from '../services/relays'
import type { Relay } from '../services/relays'

interface RelayVariables extends RequestVariables {
  relay: Relay
}

/** A plain address: one @, something either side, no spaces. Enough to refuse a header that is not an address. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Finds the relay for the bearer key, or refuses with 401 and one message. */
const requireRelay = createMiddleware<{ Variables: RelayVariables }>(async (c, next) => {
  const key = bearerOf(c.req.header('Authorization'))
  const relay = key === '' ? null : await relayForKey(c.get('runtime'), key)
  if (relay === null) throw new ApiError(401, ERROR_CODES.authMissing, REFUSALS.relayUnauthorized)
  c.set('relay', relay)
  await next()
})

/**
 * @route POST /v1/relay/messages
 * @summary Hand over one message from a relay.
 * @description For a relay Worker in another Cloudflare account, with its own key (`bmr_...`). The raw message is the
 *              body and the envelope travels in `X-Envelope-From` and `X-Envelope-To`. Taken only for a domain the
 *              relay's mailbox owns, then stored and announced like mail from the catch-all.
 * @tags Relay
 * @auth Bearer
 * @param {string} X-Envelope-From.header.required - The envelope sender.
 * @param {string} X-Envelope-To.header.required - The exact address the message was delivered to.
 * @returns {RelayAccepted} 202 - The message was stored.
 * @returns {ErrorResponseSchema} 400 - The envelope headers are missing or not addresses.
 * @returns {ErrorResponseSchema} 401 - No valid relay key.
 * @returns {ErrorResponseSchema} 403 - The relay's mailbox does not own that domain.
 * @returns {ErrorResponseSchema} 413 - The message is too large.
 */
const relayMessageRoute = createRoute({
  method: 'post',
  path: '/relay/messages',
  middleware: [requireRelay] as const,
  request: {
    headers: z.object({ 'x-envelope-from': z.string().optional(), 'x-envelope-to': z.string().optional() }),
    body: { content: { 'message/rfc822': { schema: z.string().openapi({ format: 'binary' }) } }, required: true },
  },
  responses: {
    202: { content: { 'application/json': { schema: z.object({ id: z.string() }).openapi('RelayAccepted') } }, description: 'The message was stored' },
    400: errorResponse('The envelope headers are missing or not addresses'),
    401: errorResponse('No valid relay key'),
    403: errorResponse("The relay's mailbox does not own that domain"),
    413: errorResponse('The message is too large'),
  },
  tags: ['Relay'],
  security: BEARER_SECURITY,
})

/** Mail handed over by a relay in another Cloudflare account. */
export const relay = router<{ Variables: RelayVariables }>().openapi(relayMessageRoute, async (c) => {
  const from = c.req.header('X-Envelope-From')?.trim() ?? ''
  const to = c.req.header('X-Envelope-To')?.trim() ?? ''
  if (!ADDRESS.test(from) || !ADDRESS.test(to)) throw new ApiError(400, ERROR_CODES.validationFailed, REFUSALS.relayEnvelope)
  const runtime = c.get('runtime')
  const owner = c.get('relay').mailboxId
  if (!(await mailboxOwnsAddress(runtime, owner, to))) throw new ApiError(403, ERROR_CODES.permissionDenied, REFUSALS.relayDomain)
  const declared = Number(c.req.header('Content-Length') ?? '0')
  if (declared > MAX_MESSAGE_BYTES) throw new ApiError(413, ERROR_CODES.tooLarge, REFUSALS.tooLarge)
  const raw = new Uint8Array(await c.req.arrayBuffer())
  if (raw.byteLength > MAX_MESSAGE_BYTES) throw new ApiError(413, ERROR_CODES.tooLarge, REFUSALS.tooLarge)
  const stored = await receive(runtime, owner, { from, to }, raw)
  await runtime.notify(owner, stored.id).catch(() => undefined)
  return c.json({ id: stored.id }, 202)
})
