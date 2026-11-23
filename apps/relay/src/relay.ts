/**
 * Hands one message to the Buun Mail gateway. Kept apart from the Worker entry so tests pass their own `fetch`.
 */

/** An incoming message as Email Routing hands it to the email handler: the slice the relay uses. */
export interface IncomingEmail {
  /** The envelope sender (MAIL FROM). */
  readonly from: string
  /** The envelope recipient (RCPT TO): the exact address the message was sent to. */
  readonly to: string
  readonly raw: ReadableStream<Uint8Array>
  readonly rawSize: number
  setReject(reason: string): void
}

/** What the relay needs from its environment. */
export interface RelayEnv {
  /** The gateway, such as `https://buun-mail-gateway.example.workers.dev`. */
  GATEWAY_URL: string
  /** This relay's key, `bmr_...`. */
  RELAY_KEY?: string
}

/** The gateway's path for relayed mail. */
const RELAY_PATH = '/v1/relay/messages'

/** How long the gateway may take to take a message; past it the sender is told to retry. */
const GATEWAY_TIMEOUT_MS = 20_000

/** The bounce text when the gateway turns a message down for good, such as a domain its mailbox does not own. */
const REFUSED = 'This address does not accept mail.'

/** The statuses that mean a client error the sender caused. */
const CLIENT_ERROR_MIN = 400
const CLIENT_ERROR_MAX = 499

/** Client errors that are the relay's fault or passing, so the sender retries instead of getting a bounce. */
const RETRY_STATUSES: ReadonlySet<number> = new Set([401, 429])

/** Thrown for a failure worth retrying: Email Routing then answers the sender with a temporary error. */
export class RetryLater extends Error {}

/**
 * Posts the raw message and its envelope to the gateway. A permanent refusal (4xx) is passed back to the sender as a
 * rejection; anything else that is not a success (no key, the gateway down or failing) throws, so the sending server
 * retries later and no mail is lost.
 */
export async function relay(message: IncomingEmail, env: RelayEnv, fetcher: typeof fetch = fetch): Promise<void> {
  const key = env.RELAY_KEY
  if (key === undefined || key === '') throw new RetryLater('RELAY_KEY is not set')
  const raw = await new Response(message.raw).arrayBuffer()
  let response: Response
  try {
    response = await fetcher(new URL(RELAY_PATH, env.GATEWAY_URL), {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'X-Envelope-From': message.from, 'X-Envelope-To': message.to, 'Content-Type': 'message/rfc822' },
      body: raw,
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    })
  } catch (error) {
    throw new RetryLater(`the gateway could not be reached: ${String(error)}`)
  }
  if (response.ok) return
  // 401 means this relay's own key is wrong: the sender is not at fault, so it retries while the key is fixed.
  if (response.status >= CLIENT_ERROR_MIN && response.status <= CLIENT_ERROR_MAX && !RETRY_STATUSES.has(response.status)) {
    message.setReject(REFUSED)
    return
  }
  throw new RetryLater(`the gateway answered ${response.status}`)
}
