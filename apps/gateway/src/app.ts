import type { OpenAPIHono } from '@hono/zod-openapi'

import { ERROR_CODES, REFUSALS } from './constants'
import { ApiError, envelopeOf } from './lib/api-error'
import type { RequestVariables } from './lib/auth'
import { router } from './lib/openapi'
import type { Runtime } from './lib/runtime'
import { domains } from './routes/domains'
import { messages } from './routes/messages'
import { relay } from './routes/relay'
import type { Bindings } from './types'

/** The header every answer carries, so a refusal in the app matches a line in the Worker's log. */
const REQUEST_ID_HEADER = 'X-Request-Id'

/** Cloudflare's id for the request, when it has one; the request id reuses it. */
const RAY_HEADER = 'cf-ray'

/** The app's environment: the Worker bindings and what every request carries. */
type AppEnv = { Bindings: Bindings; Variables: RequestVariables }

/** Writes one structured log line for a failure. Expected refusals are not logged; their cause, when there is one, is. */
function logFailure(error: Error, requestId: string, route: string): void {
  const cause = error.cause instanceof Error ? error.cause.message : undefined
  console.error(JSON.stringify({ event: error instanceof ApiError ? 'gateway.upstream' : 'gateway.unhandled', requestId, route, message: error.message, cause, stack: error instanceof ApiError ? undefined : error.stack }))
}

/** The HTTP side of the gateway. `runtimeOf` builds the runtime per request, so tests hand in fakes. */
export function createApp(runtimeOf: (env: Bindings) => Runtime): OpenAPIHono<AppEnv> {
  const app = router<AppEnv>()
  app.use('*', async (c, next) => {
    const requestId = c.req.header(RAY_HEADER) ?? crypto.randomUUID()
    c.set('requestId', requestId)
    c.set('runtime', runtimeOf(c.env))
    await next()
    c.header(REQUEST_ID_HEADER, requestId)
  })

  /**
   * @route GET /health
   * @summary Say the gateway is up.
   * @description Reads nothing, so a monitor can call it as often as it likes.
   * @tags Health
   * @auth None
   * @returns {object} 200 - `{"ok":true}`.
   */
  app.get('/health', (c) => c.json({ ok: true }))

  app.route('/v1', messages)
  app.route('/v1', domains)
  app.route('/v1', relay)

  app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', { type: 'http', scheme: 'bearer', description: 'A mailbox token (bmg_...), or for the relay route a relay key (bmr_...)' })
  app.doc31('/openapi.json', { openapi: '3.1.0', info: { title: 'Buun Mail gateway', version: '1' } })

  app.notFound((c) => c.json(envelopeOf(new ApiError(404, ERROR_CODES.notFound, REFUSALS.nothingHere), c.get('requestId')), 404))
  app.onError((error, c) => {
    const requestId = c.get('requestId')
    const known = error instanceof ApiError ? error : new ApiError(500, ERROR_CODES.internal, REFUSALS.internal, { cause: error })
    if (!(error instanceof ApiError) || error.cause !== undefined) logFailure(error, requestId, `${c.req.method} ${c.req.path}`)
    c.header(REQUEST_ID_HEADER, requestId)
    return c.json(envelopeOf(known, requestId), known.status)
  })
  return app
}
