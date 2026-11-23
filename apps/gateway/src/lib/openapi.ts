import { OpenAPIHono, z } from '@hono/zod-openapi'
import type { Env } from 'hono'

import { ERROR_CODES, REFUSALS } from '../constants'
import { ApiError } from './api-error'

/** The error envelope, as the OpenAPI document describes it. */
export const ErrorResponseSchema = z
  .object({
    error: z.literal(true),
    errorCode: z.string().openapi({ example: ERROR_CODES.authMissing }),
    message: z.string().openapi({ example: REFUSALS.unauthorized }),
    requestId: z.string(),
  })
  .openapi('ErrorResponse')

/** An error response for `createRoute`, in one line per status. */
export const errorResponse = (description: string) => ({ content: { 'application/json': { schema: ErrorResponseSchema } }, description })

/** The bearer scheme both credentials use: a mailbox token (`bmg_`) or a relay key (`bmr_`). */
export const BEARER_SECURITY = [{ Bearer: [] }]

/**
 * A router whose failed validation throws the standard refusal, so every route answers a bad request the same way and
 * the app's one error handler renders it.
 */
export function router<E extends Env>(): OpenAPIHono<E> {
  return new OpenAPIHono<E>({
    defaultHook: (result) => {
      if (!result.success) throw new ApiError(400, ERROR_CODES.validationFailed, REFUSALS.invalid)
    },
  })
}
