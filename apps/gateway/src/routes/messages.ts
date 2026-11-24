import { createRoute, z } from '@hono/zod-openapi'

import { ACK_LIMIT, ERROR_CODES, LIST_LIMIT_MAX, REFUSALS } from '../constants'
import { ApiError } from '../lib/api-error'
import { requireMailbox } from '../lib/auth'
import type { GatewayVariables } from '../lib/auth'
import { ID_PREFIXES } from '../lib/ids'
import { BEARER_SECURITY, errorResponse, router } from '../lib/openapi'
import { acknowledge, collectWaiting, listWaiting, rawMessage } from '../services/messages'

const WaitingMessageSchema = z
  .object({
    id: z.string().openapi({ example: 'mml_8sqnb47feejhvrrhevh0azqj' }),
    envelopeFrom: z.string(),
    envelopeTo: z.string().openapi({ description: 'The exact address the message was delivered to' }),
    size: z.number().int(),
    receivedAt: z.number().int().openapi({ description: 'Milliseconds since the epoch' }),
  })
  .openapi('WaitingMessage')

const MessageListSchema = z.object({ messages: z.array(WaitingMessageSchema) }).openapi('MessageList')
const AckBodySchema = z.object({ ids: z.array(z.string().startsWith(ID_PREFIXES.mailMessage)).min(1).max(ACK_LIMIT) }).openapi('AckBody')
const AckResultSchema = z.object({ acknowledged: z.number().int() }).openapi('AckResult')

const CollectBodySchema = z
  .object({
    ack: z.array(z.string().startsWith(ID_PREFIXES.mailMessage)).max(ACK_LIMIT).default([]).openapi({ description: 'Ids now stored by the app, forgotten first' }),
    limit: z.number().int().min(1).max(LIST_LIMIT_MAX).optional(),
  })
  .openapi('CollectBody')

const CollectedMessageSchema = WaitingMessageSchema.extend({
  raw: z.string().optional().openapi({ description: 'The message, base64, when it was small enough to come inline; otherwise fetch /raw' }),
}).openapi('CollectedMessage')

const CollectResultSchema = z.object({ acknowledged: z.number().int(), messages: z.array(CollectedMessageSchema) }).openapi('CollectResult')

/**
 * @route GET /v1/messages
 * @summary List the mail waiting in this mailbox.
 * @description Oldest first, so the app takes mail in arrival order. Acknowledged mail drops off the list.
 * @tags Mail
 * @auth Bearer
 * @param {number} limit.query - How many to return, 1 to 100. Default 50.
 * @returns {MessageList} 200 - Waiting mail.
 * @returns {ErrorResponseSchema} 400 - The limit is not valid.
 * @returns {ErrorResponseSchema} 401 - No valid mailbox token.
 */
const listMessagesRoute = createRoute({
  method: 'get',
  path: '/messages',
  middleware: [requireMailbox] as const,
  request: { query: z.object({ limit: z.coerce.number().int().min(1).max(LIST_LIMIT_MAX).optional() }) },
  responses: {
    200: { content: { 'application/json': { schema: MessageListSchema } }, description: 'Waiting mail' },
    400: errorResponse('The limit is not valid'),
    401: errorResponse('No valid mailbox token'),
  },
  tags: ['Mail'],
  security: BEARER_SECURITY,
})

/**
 * @route GET /v1/messages/:id/raw
 * @summary Fetch one waiting message's raw bytes.
 * @tags Mail
 * @auth Bearer
 * @param {string} id.path.required - The message id, `mml_...`.
 * @returns {string} 200 - The message as `message/rfc822`.
 * @returns {ErrorResponseSchema} 401 - No valid mailbox token.
 * @returns {ErrorResponseSchema} 404 - No such message in this mailbox.
 */
const rawMessageRoute = createRoute({
  method: 'get',
  path: '/messages/{id}/raw',
  middleware: [requireMailbox] as const,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'message/rfc822': { schema: z.string().openapi({ format: 'binary' }) } }, description: 'The raw message' },
    401: errorResponse('No valid mailbox token'),
    404: errorResponse('No such message in this mailbox'),
  },
  tags: ['Mail'],
  security: BEARER_SECURITY,
})

/**
 * @route POST /v1/messages/ack
 * @summary Forget messages the app has stored.
 * @description Removes the rows and the bytes. Ids that are not this mailbox's are ignored, so the count may be lower.
 * @tags Mail
 * @auth Bearer
 * @param {AckBody} body.body.required - The ids to forget, 1 to 500.
 * @returns {AckResult} 200 - How many were removed.
 * @returns {ErrorResponseSchema} 400 - The ids are not valid.
 * @returns {ErrorResponseSchema} 401 - No valid mailbox token.
 */
const ackMessagesRoute = createRoute({
  method: 'post',
  path: '/messages/ack',
  middleware: [requireMailbox] as const,
  request: { body: { content: { 'application/json': { schema: AckBodySchema } }, required: true } },
  responses: {
    200: { content: { 'application/json': { schema: AckResultSchema } }, description: 'How many were removed' },
    400: errorResponse('The ids are not valid'),
    401: errorResponse('No valid mailbox token'),
  },
  tags: ['Mail'],
  security: BEARER_SECURITY,
})

/**
 * @route POST /v1/messages/collect
 * @summary Acknowledge stored mail and take the next waiting messages, in one request.
 * @description Forgets `ack`, then lists waiting mail oldest first. Messages up to 1 MiB come with their bytes inline
 * (base64), up to 8 MiB an answer; a larger one has no `raw` and is fetched from `/raw`. An app calls it until the list
 * comes back empty, acknowledging each batch in the next call.
 * @tags Mail
 * @auth Bearer
 * @param {CollectBody} body.body.required - The ids to forget (0 to 500) and how many to return (1 to 100, default 50).
 * @returns {CollectResult} 200 - How many were forgotten, and the waiting mail.
 * @returns {ErrorResponseSchema} 400 - The body is not valid.
 * @returns {ErrorResponseSchema} 401 - No valid mailbox token.
 */
const collectMessagesRoute = createRoute({
  method: 'post',
  path: '/messages/collect',
  middleware: [requireMailbox] as const,
  request: { body: { content: { 'application/json': { schema: CollectBodySchema } }, required: true } },
  responses: {
    200: { content: { 'application/json': { schema: CollectResultSchema } }, description: 'How many were forgotten, and the waiting mail' },
    400: errorResponse('The body is not valid'),
    401: errorResponse('No valid mailbox token'),
  },
  tags: ['Mail'],
  security: BEARER_SECURITY,
})

/**
 * @route GET /v1/stream
 * @summary Hear about new mail over a WebSocket.
 * @description Sends `{"type":"arrived","id":"mml_..."}` for each new message and answers `ping` with a pong.
 * @tags Mail
 * @auth Bearer
 * @returns {WebSocket} 101 - Switched to a WebSocket.
 * @returns {ErrorResponseSchema} 401 - No valid mailbox token.
 * @returns {ErrorResponseSchema} 426 - Not asked for as a WebSocket.
 */
const streamRoute = createRoute({
  method: 'get',
  path: '/stream',
  middleware: [requireMailbox] as const,
  responses: {
    101: { description: 'Switched to a WebSocket' },
    401: errorResponse('No valid mailbox token'),
    426: errorResponse('Not asked for as a WebSocket'),
  },
  tags: ['Mail'],
  security: BEARER_SECURITY,
})

/**
 * The app API: list waiting mail, fetch one message's bytes, acknowledge what is stored, collect (acknowledge and list
 * in one, small messages inline), listen for new mail.
 */
export const messages = router<{ Variables: GatewayVariables }>()
  .openapi(listMessagesRoute, async (c) => {
    const { limit } = c.req.valid('query')
    return c.json({ messages: await listWaiting(c.get('runtime'), c.get('mailbox').id, limit) }, 200)
  })
  .openapi(rawMessageRoute, async (c) => {
    const raw = await rawMessage(c.get('runtime'), c.get('mailbox').id, c.req.valid('param').id)
    if (raw === null) throw new ApiError(404, ERROR_CODES.notFound, REFUSALS.notFound)
    return c.body(raw, 200, { 'Content-Type': 'message/rfc822', 'Cache-Control': 'no-store' })
  })
  .openapi(ackMessagesRoute, async (c) => {
    const { ids } = c.req.valid('json')
    return c.json({ acknowledged: await acknowledge(c.get('runtime'), c.get('mailbox').id, ids) }, 200)
  })
  .openapi(collectMessagesRoute, async (c) => {
    const { ack, limit } = c.req.valid('json')
    return c.json(await collectWaiting(c.get('runtime'), c.get('mailbox').id, ack, limit), 200)
  })
  .openapi(streamRoute, async (c) => {
    if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') throw new ApiError(426, ERROR_CODES.upgradeRequired, REFUSALS.upgrade)
    return c.get('runtime').connect(c.get('mailbox').id, c.req.raw)
  })
