import type { Bindings, Bucket, Database } from '../types'
import { rawMailStore } from './blobs'
import { cloudflareFrom } from './cloudflare'
import type { CloudflareApi } from './cloudflare'

/** Everything a route or service may reach, built once per request or event. Nothing else reaches for a global. */
export interface Runtime {
  db: Database
  mail: Bucket
  /** Tells a mailbox's connected apps that mail arrived. A test swaps it for a recorder. */
  notify(mailboxId: string, messageId: string): Promise<void>
  /** Hands an app's WebSocket upgrade to its mailbox's notifier. */
  connect(mailboxId: string, request: Request): Promise<Response>
  /** Cloudflare, for routing a domain's mail here; null when the gateway has no token. */
  cloudflare: CloudflareApi | null
  /** This Worker's name, which a zone's catch-all points at. */
  workerName: string
  now(): number
}

/** The URL the Worker posts a notification to inside the notifier. Only the path is read. */
const NOTIFY_URL = 'https://notifier/notify'

/** The runtime for a live request or event. */
export function runtimeFrom(env: Bindings): Runtime {
  const notifierFor = (mailboxId: string) => env.NOTIFIER.get(env.NOTIFIER.idFromName(mailboxId))
  return {
    db: env.DB,
    mail: rawMailStore(env.MAIL, env.DB),
    cloudflare: cloudflareFrom(env),
    workerName: env.WORKER_NAME,
    now: () => Date.now(),
    async notify(mailboxId, messageId) {
      await notifierFor(mailboxId).fetch(new Request(NOTIFY_URL, { method: 'POST', body: JSON.stringify({ type: 'arrived', id: messageId }) }))
    },
    connect(mailboxId, request) {
      return notifierFor(mailboxId).fetch(request)
    },
  }
}
