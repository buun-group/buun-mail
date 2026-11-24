/** The most messages one list returns. The app pages by acknowledging what it has. */
export const LIST_LIMIT_MAX = 100

/** A list returns this many unless asked. */
export const LIST_LIMIT_DEFAULT = 50

/** How long uncollected mail waits before the daily clean-up removes it: 30 days. */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** How long one call to the Cloudflare API may take before the gateway gives up on it. */
export const CLOUDFLARE_TIMEOUT_MS = 10_000

/** The largest message accepted. Email Routing itself stops at about 25 MiB. */
export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024

/** How many random bytes make a mailbox token: 256 bits, written as 64 hex characters after the prefix. */
export const TOKEN_BYTES = 32

/** Every token starts with this, so a leaked one is recognisable in a log or a secret scanner. */
export const TOKEN_PREFIX = 'bmg_'

/** Every relay key starts with this, apart from mailbox tokens, so a leaked one is recognisable. */
export const RELAY_KEY_PREFIX = 'bmr_'

/** How a domain's mail reaches the gateway. */
export const DOMAIN_ROUTES = ['catch_all', 'relay'] as const

/** The most ids one acknowledgement may carry. */
export const ACK_LIMIT = 500

/** A collected message up to this size comes with its bytes, so the app needs no second request for it: 1 MiB. */
export const INLINE_MESSAGE_MAX = 1024 * 1024

/** The most bytes one collect answer carries inline, across its messages; the rest are fetched one by one: 8 MiB. */
export const INLINE_TOTAL_MAX = 8 * 1024 * 1024

/** How many times the email handler tries to tell a mailbox's apps about new mail before leaving it to their check. */
export const NOTIFY_ATTEMPTS = 3

/** Where the Cloudflare API lives. */
export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'

/** A domain name the gateway accepts: lower case labels, a dot, a top-level name. */
export const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/**
 * The stable `errorCode` of each refusal, part of the API's contract: an app may branch on one, so a code is never
 * renamed or reused for another case.
 */
export const ERROR_CODES = {
  /** The mailbox token or relay key is missing, malformed or unknown. */
  authMissing: 'auth.missing',
  /** The request failed its schema, or a header is not an address. */
  validationFailed: 'validation.failed',
  /** The message, domain or route does not exist for this caller. */
  notFound: 'not_found',
  /** The domain already belongs to a mailbox. */
  conflict: 'conflict',
  /** A relay tried to deliver for a domain its mailbox does not own. */
  permissionDenied: 'permission.denied',
  /** The message is larger than the gateway takes. */
  tooLarge: 'payload.too_large',
  /** The stream was asked for without a WebSocket upgrade. */
  upgradeRequired: 'upgrade_required',
  /** The gateway has no Cloudflare token, so it cannot change routing. */
  notConfigured: 'gateway.not_configured',
  /** Cloudflare refused or failed a routing change. */
  upstream: 'upstream',
  /** Anything unexpected; the cause is in the Worker's log, never in the answer. */
  internal: 'internal',
} as const

/** One stable error code. */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** The words the gateway answers a refusal with. One refusal, one message: none says which check failed. */
export const REFUSALS = {
  unauthorized: 'Send the mailbox token as Authorization: Bearer <token>.',
  notFound: 'There is no such message in this mailbox.',
  invalid: 'The request is not valid.',
  noMailbox: 'This address does not accept mail.',
  tooLarge: 'This message is too large.',
  notConfigured: 'This gateway has no Cloudflare token, so its domains cannot be changed here.',
  notInAccount: "That domain is not in this gateway's Cloudflare account.",
  taken: 'That domain already belongs to a mailbox.',
  notYours: 'That domain does not belong to this mailbox.',
  cloudflare: 'Cloudflare refused the change. Check the token has Email Routing edit on that domain.',
  relayUnauthorized: 'Send the relay key as Authorization: Bearer <key>.',
  relayDomain: "This relay's mailbox does not own that domain.",
  relayEnvelope: 'Send the envelope as X-Envelope-From and X-Envelope-To headers.',
  upgrade: 'Open this as a WebSocket.',
  nothingHere: 'Nothing here.',
  internal: 'Something went wrong in the gateway. Try again.',
} as const
