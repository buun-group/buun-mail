import type { ErrorCode } from '../constants'

/** The statuses the gateway refuses with. */
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 426 | 500 | 502 | 503

/**
 * A refusal with its status, stable code and words. Services and middleware throw it; the app's error handler renders
 * it as the error envelope, so no route picks a status by hand.
 */
export class ApiError extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ApiError'
  }
}

/** The error envelope every refusal answers with. The desktop app reads `message`; `errorCode` is for branching. */
export interface ErrorEnvelope {
  error: true
  errorCode: ErrorCode
  message: string
  requestId: string
}

/** The envelope for a refusal. */
export function envelopeOf(error: ApiError, requestId: string): ErrorEnvelope {
  return { error: true, errorCode: error.code, message: error.message, requestId }
}
