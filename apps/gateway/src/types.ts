/**
 * The slice of the Workers runtime the gateway uses, declared here rather than pulled from a types package. Tests stand
 * each one in with a small fake.
 */

/** A prepared D1 statement. */
export interface Statement {
  bind(...values: unknown[]): Statement
  first<Row>(): Promise<Row | null>
  all<Row>(): Promise<{ results: Row[] }>
  run(): Promise<{ meta: { changes: number } }>
}

/** The part of D1 the gateway uses. */
export interface Database {
  prepare(sql: string): Statement
  batch(statements: Statement[]): Promise<unknown[]>
}

/** An object read back from R2. */
export interface StoredObject {
  arrayBuffer(): Promise<ArrayBuffer>
}

/** Where raw messages are kept: put, get and delete by key, as R2 shapes it. `lib/blobs.ts` keeps them in D1. */
export interface Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array): Promise<unknown>
  get(key: string): Promise<StoredObject | null>
  delete(keys: string | string[]): Promise<void>
}

/** A Durable Object stub: what a Worker holds to talk to one instance. */
export interface DurableStub {
  fetch(request: Request): Promise<Response>
}

/** A Durable Object namespace binding. */
export interface DurableNamespace {
  idFromName(name: string): unknown
  get(id: unknown): DurableStub
}

/** The bindings in wrangler.jsonc. */
export interface Bindings {
  DB: Database
  /** R2 for raw mail, when the account has it. Without it raw mail lives in D1. */
  MAIL?: Bucket
  NOTIFIER: DurableNamespace
  ENVIRONMENT: string
  /** This Worker's own name, which a zone's catch-all points at. */
  WORKER_NAME: string
  /** A Cloudflare token with Zone Read and Email Routing edit, for managing domains. Without it domains are read-only. */
  CLOUDFLARE_API_TOKEN?: string
  /** The Cloudflare account whose zones a mailbox may claim. */
  CLOUDFLARE_ACCOUNT_ID?: string
  /** `on` lets local development change Cloudflare. Off by default, so a test run never redirects real mail. */
  CLOUDFLARE_WRITES?: string
}

/** An incoming message as Email Routing hands it to the email handler. */
export interface IncomingEmail {
  /** The envelope sender (MAIL FROM). */
  readonly from: string
  /** The envelope recipient (RCPT TO): the exact address the message was sent to. */
  readonly to: string
  readonly raw: ReadableStream<Uint8Array>
  readonly rawSize: number
  setReject(reason: string): void
}
