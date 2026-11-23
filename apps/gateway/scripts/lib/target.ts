/**
 * Where an admin command acts: the local development database (through Wrangler's platform proxy) or the deployed
 * one (through Cloudflare's D1 HTTP API). Both take bound parameters, so no command ever writes a value into SQL text,
 * and both feed the same services the Worker runs.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getPlatformProxy } from 'wrangler'
import { z } from 'zod'

import { CLOUDFLARE_API, CLOUDFLARE_TIMEOUT_MS } from '../../src/constants'
import { cloudflareFrom } from '../../src/lib/cloudflare'
import type { Runtime } from '../../src/lib/runtime'
import type { Bindings, Database, Statement } from '../../src/types'

/** Local development, or a deployed environment in wrangler.jsonc. */
export type Environment = 'local' | 'preview' | 'production'

/** An open runtime for one admin command, and how to release it. */
export interface Opened {
  runtime: Runtime
  close(): Promise<void>
}

/** One query's rows and how many it changed, as the D1 HTTP API answers. */
interface QueryResult {
  results: unknown[]
  meta: { changes: number }
}

const ROOT = path.resolve(import.meta.dirname, '../..')

/** Where `pnpm dev` keeps the local database; the same folder the dev script persists to. */
const LOCAL_STATE = path.join(ROOT, '.wrangler/state/v3')

/** The database id wrangler.jsonc ships with, before `wrangler d1 create` gives a real one. */
const PLACEHOLDER_ID = /^0{8}-/

/** The parts of one wrangler.jsonc scope an admin command reads. */
const scopeSchema = z.object({
  vars: z.record(z.string(), z.string()).optional(),
  d1_databases: z.array(z.object({ database_id: z.string() })).optional(),
})

const configSchema = scopeSchema.extend({ env: z.record(z.string(), scopeSchema).optional() })

/** One D1 HTTP API answer, the parts read here. */
const queryAnswerSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ message: z.string() })).optional(),
  result: z.array(z.object({ results: z.array(z.unknown()), meta: z.object({ changes: z.number() }) })).optional(),
})

/** Reads wrangler.jsonc, dropping its whole-line comments. */
function wranglerConfig(): z.infer<typeof configSchema> {
  const text = readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error(`wrangler.jsonc could not be read: ${String(error)}`, { cause: error })
  }
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) throw new Error('wrangler.jsonc is not in the shape this command expects.')
  return parsed.data
}

/** Reads a variable the shell must provide. */
function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`${name} is not set. Export it in this shell (see docs/self-hosting.md) and try again.`)
  return value
}

/** D1 over Cloudflare's HTTP API, with bound parameters. */
function remoteDatabase(databaseId: string): Database {
  const token = required('CLOUDFLARE_API_TOKEN')
  const account = required('CLOUDFLARE_ACCOUNT_ID')
  async function query(sql: string, params: unknown[]): Promise<QueryResult> {
    const response = await fetch(`${CLOUDFLARE_API}/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(databaseId)}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
    })
    const body = queryAnswerSchema.safeParse(await response.json().catch(() => null))
    if (!body.success) throw new Error(`D1 answered HTTP ${response.status} in an unexpected shape.`)
    if (!body.data.success) throw new Error(`D1 refused the query: ${body.data.errors?.map((error) => error.message).join('; ') ?? response.status}`)
    return body.data.result?.[0] ?? { results: [], meta: { changes: 0 } }
  }
  const statement = (sql: string, values: unknown[]): Statement => ({
    bind: (...bound) => statement(sql, bound),
    first: async <Row>() => ((await query(sql, values)).results[0] ?? null) as Row | null,
    all: async <Row>() => ({ results: (await query(sql, values)).results as Row[] }),
    run: async () => ({ meta: { changes: (await query(sql, values)).meta.changes } }),
  })
  // The HTTP API has no batch here, so statements run one after another. Admin commands only batch a new mailbox's
  // own rows, and a failure part way leaves a mailbox with no domains, which `add-domain` fills in.
  return {
    prepare: (sql) => statement(sql, []),
    async batch(statements) {
      const results: unknown[] = []
      for (const item of statements) results.push(await item.run())
      return results
    },
  }
}

/** The environment variables cloudflareFrom reads, taken from this shell. */
function cloudflareBindings(environment: Environment, workerName: string): Bindings {
  const token = process.env['CLOUDFLARE_API_TOKEN']
  const account = process.env['CLOUDFLARE_ACCOUNT_ID']
  return {
    ENVIRONMENT: environment === 'local' ? 'dev' : environment,
    WORKER_NAME: workerName,
    ...(token === undefined ? {} : { CLOUDFLARE_API_TOKEN: token }),
    ...(account === undefined ? {} : { CLOUDFLARE_ACCOUNT_ID: account }),
  } as Bindings
}

/** A runtime for an admin command. Mail, notifications and sockets are not used here. */
export async function openRuntime(environment: Environment): Promise<Opened> {
  const config = wranglerConfig()
  const scope = environment === 'local' ? config : config.env?.[environment]
  const workerName = scope?.vars?.['WORKER_NAME'] ?? 'buun-mail-gateway'
  const unused = (): never => {
    throw new Error('Admin commands do not send mail or notifications.')
  }
  const base = {
    mail: { put: unused, get: unused, delete: unused },
    notify: unused,
    connect: unused,
    cloudflare: cloudflareFrom(cloudflareBindings(environment, workerName)),
    workerName,
    now: () => Date.now(),
  }

  if (environment === 'local') {
    const proxy = await getPlatformProxy<{ DB: Database }>({ configPath: path.join(ROOT, 'wrangler.jsonc'), persist: { path: LOCAL_STATE } })
    return { runtime: { ...base, db: proxy.env.DB }, close: () => proxy.dispose() }
  }
  const databaseId = scope?.d1_databases?.[0]?.database_id ?? ''
  if (databaseId === '' || PLACEHOLDER_ID.test(databaseId)) throw new Error(`The ${environment} database is not set up yet: put the id \`wrangler d1 create\` printed in wrangler.jsonc.`)
  return { runtime: { ...base, db: remoteDatabase(databaseId) }, close: () => Promise.resolve() }
}
