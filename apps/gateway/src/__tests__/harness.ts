import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'

import { createApp } from '../app'
import { CloudflareError } from '../lib/cloudflare'
import type { CatchAll, CloudflareApi, Zone } from '../lib/cloudflare'
import type { Runtime } from '../lib/runtime'
import { createMailbox } from '../services/mailboxes'
import type { Bindings, Bucket, Database, IncomingEmail, Statement } from '../types'

const MIGRATIONS = path.resolve(import.meta.dirname, '../../migrations')

/** The clock every harness starts at, a fixed moment so tests never read the real time. */
const START = 1_800_000_000_000

function toInput(value: unknown): SQLInputValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || value instanceof Uint8Array) return value
  throw new Error(`A test bound a value SQLite cannot store: ${typeof value}`)
}

/** SQLite in memory with the real migrations, behind the part of D1 the gateway uses. */
export function createTestDatabase(): { db: Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'))
  const statement = (sql: string, values: unknown[]): Statement => ({
    bind: (...bound) => statement(sql, bound),
    first: <Row>() => Promise.resolve((sqlite.prepare(sql).get(...values.map(toInput)) ?? null) as Row | null),
    all: <Row>() => Promise.resolve({ results: sqlite.prepare(sql).all(...values.map(toInput)) as Row[] }),
    run: () => Promise.resolve({ meta: { changes: Number(sqlite.prepare(sql).run(...values.map(toInput)).changes) } }),
  })
  return { db: { prepare: (sql) => statement(sql, []), batch: (statements) => Promise.all(statements.map((item) => item.run())) }, sqlite }
}

/** R2 as a map. */
export function createTestBucket(): Bucket & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    put: (key, value) => {
      objects.set(key, value instanceof Uint8Array ? value : new Uint8Array(value))
      return Promise.resolve()
    },
    get: (key) => {
      const value = objects.get(key)
      return Promise.resolve(value === undefined ? null : { arrayBuffer: () => Promise.resolve(value.slice().buffer) })
    },
    delete: (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key)
      return Promise.resolve()
    },
  }
}

/** The Worker name tests use. */
export const WORKER = 'buun-mail-gateway-test'

const NO_RULE: CatchAll = { enabled: false, matchers: [], actions: [] }

/** A Cloudflare account as a few zones with catch-all rules, recording each change. `fail` makes changes refused. */
export function createTestCloudflare(zones: { name: string; catchAll: CatchAll; routing?: boolean }[]) {
  const list: Zone[] = zones.map((zone, index) => ({ id: `zone-${index}`, name: zone.name }))
  const rules = new Map(list.map((zone, index) => [zone.id, zones[index]?.catchAll ?? NO_RULE]))
  const enabled = new Set(list.filter((_, index) => zones[index]?.routing !== false).map((zone) => zone.id))
  const state = { fail: false }
  const api: CloudflareApi = {
    zones: () => Promise.resolve(list),
    routingEnabled: (zoneId) => Promise.resolve(enabled.has(zoneId)),
    enableRouting: (zoneId) => {
      enabled.add(zoneId)
      return Promise.resolve()
    },
    catchAll: (zoneId) => Promise.resolve(rules.get(zoneId) ?? NO_RULE),
    setCatchAll: (zoneId, rule) => {
      if (state.fail) return Promise.reject(new CloudflareError('Authentication error'))
      rules.set(zoneId, rule)
      return Promise.resolve()
    },
  }
  return { api, rules, enabled, state }
}

/** A gateway with fakes, a clock the test moves, and a record of every notification. */
export function createHarness(cloudflare: CloudflareApi | null = null) {
  const { db, sqlite } = createTestDatabase()
  const mail = createTestBucket()
  const notified: { mailboxId: string; messageId: string }[] = []
  let clock = START
  const runtime: Runtime = {
    db,
    mail,
    now: () => clock,
    notify: (mailboxId, messageId) => {
      notified.push({ mailboxId, messageId })
      return Promise.resolve()
    },
    connect: () => Promise.resolve(new Response('upgraded', { status: 200 })),
    cloudflare,
    workerName: WORKER,
  }
  const app = createApp(() => runtime)
  const request = (url: string, init: RequestInit = {}) => app.request(url, init, {} as Bindings)
  return {
    runtime,
    sqlite,
    mail,
    notified,
    request,
    advance: (ms: number) => {
      clock += ms
    },
    mailbox: (name: string, domains: string[]) => createMailbox(runtime, name, domains),
    /** The ids of every stored message, oldest first. */
    messageIds: (): string[] => sqlite.prepare('SELECT id FROM messages ORDER BY received_at, id').all().map((row) => String(row['id'])),
  }
}

/** An incoming message as Email Routing would hand it over, recording a refusal. */
export function incoming(from: string, to: string, body: string, rawSize?: number): IncomingEmail & { rejected: string | null } {
  const bytes = new TextEncoder().encode(body)
  const message = {
    from,
    to,
    rawSize: rawSize ?? bytes.byteLength,
    raw: new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(bytes)
        controller.close()
      },
    }),
    rejected: null as string | null,
    setReject: (reason: string) => {
      message.rejected = reason
    },
  }
  return message
}

/** Request options that carry a bearer token. */
export const auth = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } })
