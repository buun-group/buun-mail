import { createMiddleware } from 'hono/factory'

import { ERROR_CODES, REFUSALS } from '../constants'
import { mailboxForToken } from '../services/mailboxes'
import type { Mailbox } from '../services/mailboxes'
import { ApiError } from './api-error'
import type { Runtime } from './runtime'

/** What every request carries after the app's first middleware. */
export interface RequestVariables {
  runtime: Runtime
  requestId: string
}

/** What a route can read after the mailbox middleware. */
export interface GatewayVariables extends RequestVariables {
  mailbox: Mailbox
}

/** The prefix of the Authorization header's value. */
export const BEARER = 'Bearer '

/** The credential in an Authorization header, or an empty string. */
export function bearerOf(header: string | undefined): string {
  const value = header ?? ''
  return value.startsWith(BEARER) ? value.slice(BEARER.length).trim() : ''
}

/**
 * Finds the mailbox for the bearer token, or refuses with 401 and one message, whichever check failed. A missing
 * header, a malformed one and an unknown token look the same from outside.
 */
export const requireMailbox = createMiddleware<{ Variables: GatewayVariables }>(async (c, next) => {
  const token = bearerOf(c.req.header('Authorization'))
  const mailbox = token === '' ? null : await mailboxForToken(c.get('runtime'), token)
  if (mailbox === null) throw new ApiError(401, ERROR_CODES.authMissing, REFUSALS.unauthorized)
  c.set('mailbox', mailbox)
  await next()
})
