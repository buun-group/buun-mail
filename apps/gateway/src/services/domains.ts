import { DOMAIN_PATTERN, ERROR_CODES, REFUSALS } from '../constants'
import { ApiError } from '../lib/api-error'
import { CloudflareError, describeCatchAll, parseCatchAll, pointsAt, toWorker } from '../lib/cloudflare'
import type { CatchAll, CloudflareApi } from '../lib/cloudflare'
import type { Runtime } from '../lib/runtime'

/** A domain a mailbox owns, with whether Cloudflare really sends its mail here. */
export interface OwnedDomain {
  domain: string
  /** How its mail reaches the gateway: this account's catch-all, or a relay in another account. */
  via: 'catch_all' | 'relay'
  /** True when the zone's catch-all points at this Worker; null when the gateway cannot ask Cloudflare. */
  routedHere: boolean | null
  /** What the catch-all did before the gateway took it over, restored on removal. */
  previously: string | null
}

/** A zone in the account no mailbox owns yet, with what its catch-all does today. */
export interface AvailableZone {
  domain: string
  /** The current catch-all in words, such as `forward owner@example.com`, so the person knows what changes. */
  catchAllNow: string
}

interface DomainRow {
  domain: string
  via: 'catch_all' | 'relay'
  zone_id: string | null
  previous_catch_all: string | null
}

/** One call to Cloudflare, not yet made. */
interface CloudflareCall<T> {
  (): Promise<T>
}

/** The catch-all a zone gets back when the gateway had replaced none: switched off. */
const NO_CATCH_ALL: CatchAll = { enabled: false, matchers: [{ type: 'all' }], actions: [{ type: 'drop' }] }

function cloudflareOf(runtime: Runtime): CloudflareApi {
  if (runtime.cloudflare === null) throw new ApiError(503, ERROR_CODES.notConfigured, REFUSALS.notConfigured)
  return runtime.cloudflare
}

/** Runs a Cloudflare call, turning its failure into one refusal the app can act on. */
async function cloudflareStep<T>(step: CloudflareCall<T>): Promise<T> {
  try {
    return await step()
  } catch (error) {
    // Cloudflare's own words go to the log through `cause`; the app gets the one refusal it can act on.
    if (error instanceof CloudflareError) throw new ApiError(502, ERROR_CODES.upstream, REFUSALS.cloudflare, { cause: error })
    throw error
  }
}

/** A domain as the gateway stores it: trimmed and lower case. */
function normalise(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Refuses a domain another mailbox (or this one) already owns. */
async function refuseIfOwned(runtime: Runtime, domain: string): Promise<void> {
  const owner = await runtime.db.prepare('SELECT mailbox_id FROM mailbox_domains WHERE domain = ?').bind(domain).first<{ mailbox_id: string }>()
  if (owner !== null) throw new ApiError(409, ERROR_CODES.conflict, REFUSALS.taken)
}

/** The domains a mailbox owns, each with whether its mail really reaches the gateway. */
export async function listDomains(runtime: Runtime, mailboxId: string): Promise<OwnedDomain[]> {
  const rows = await runtime.db
    .prepare('SELECT domain, via, zone_id, previous_catch_all FROM mailbox_domains WHERE mailbox_id = ? ORDER BY domain')
    .bind(mailboxId)
    .all<DomainRow>()
  return Promise.all(
    rows.results.map(async (row) => {
      const kept = row.previous_catch_all === null ? null : parseCatchAll(row.previous_catch_all)
      const previously = kept === null ? null : describeCatchAll(kept)
      if (row.via === 'relay' || runtime.cloudflare === null || row.zone_id === null) return { domain: row.domain, via: row.via, routedHere: null, previously }
      const rule = await runtime.cloudflare.catchAll(row.zone_id).catch(() => null)
      return { domain: row.domain, via: row.via, routedHere: rule === null ? null : pointsAt(rule, runtime.workerName), previously }
    }),
  )
}

/** The zones in the account that no mailbox owns, for the app's picker. */
export async function availableZones(runtime: Runtime): Promise<AvailableZone[]> {
  const cloudflare = cloudflareOf(runtime)
  const zones = await cloudflareStep(() => cloudflare.zones())
  const owned = await runtime.db.prepare('SELECT domain FROM mailbox_domains').all<{ domain: string }>()
  const taken = new Set(owned.results.map((row) => row.domain))
  const free = zones.filter((zone) => !taken.has(zone.name))
  return Promise.all(free.map(async (zone) => ({ domain: zone.name, catchAllNow: await cloudflare.catchAll(zone.id).then(describeCatchAll, () => 'unknown') })))
}

/**
 * Gives a mailbox a domain: only a zone in the gateway's own account, only one no mailbox owns. Turns Email Routing on
 * if it is off, keeps the zone's current catch-all so removal can restore it, then points the catch-all here.
 */
export async function addDomain(runtime: Runtime, mailboxId: string, raw: string): Promise<OwnedDomain> {
  const domain = normalise(raw)
  if (!DOMAIN_PATTERN.test(domain)) throw new ApiError(400, ERROR_CODES.validationFailed, REFUSALS.invalid)
  const cloudflare = cloudflareOf(runtime)
  const zone = (await cloudflareStep(() => cloudflare.zones())).find((candidate) => candidate.name === domain)
  if (zone === undefined) throw new ApiError(404, ERROR_CODES.notFound, REFUSALS.notInAccount)
  await refuseIfOwned(runtime, domain)

  const previous = await cloudflareStep(() => cloudflare.catchAll(zone.id))
  if (!(await cloudflareStep(() => cloudflare.routingEnabled(zone.id)))) await cloudflareStep(() => cloudflare.enableRouting(zone.id))
  await cloudflareStep(() => cloudflare.setCatchAll(zone.id, toWorker(runtime.workerName)))
  // Record the claim only once Cloudflare took the change, so the database never claims routing that is not there.
  const kept = pointsAt(previous, runtime.workerName) ? null : JSON.stringify(previous)
  await runtime.db
    .prepare('INSERT INTO mailbox_domains (domain, mailbox_id, zone_id, previous_catch_all, added_at) VALUES (?, ?, ?, ?, ?)')
    .bind(domain, mailboxId, zone.id, kept, runtime.now())
    .run()
  return { domain, via: 'catch_all', routedHere: true, previously: kept === null ? null : describeCatchAll(previous) }
}

/**
 * Gives a mailbox a domain that lives in another Cloudflare account, whose mail a relay there hands over. Nothing in
 * Cloudflare changes here: the relay's own account routes the domain to the relay.
 */
export async function addRelayedDomain(runtime: Runtime, mailboxId: string, raw: string): Promise<OwnedDomain> {
  const domain = normalise(raw)
  if (!DOMAIN_PATTERN.test(domain)) throw new ApiError(400, ERROR_CODES.validationFailed, REFUSALS.invalid)
  await refuseIfOwned(runtime, domain)
  await runtime.db.prepare("INSERT INTO mailbox_domains (domain, mailbox_id, via, added_at) VALUES (?, ?, 'relay', ?)").bind(domain, mailboxId, runtime.now()).run()
  return { domain, via: 'relay', routedHere: null, previously: null }
}

/**
 * Takes a domain from a mailbox. When its catch-all still points here, the catch-all the gateway replaced is put back
 * (or switched off when there was none), so the domain's mail goes where it went before.
 */
export async function removeDomain(runtime: Runtime, mailboxId: string, raw: string): Promise<void> {
  const domain = normalise(raw)
  const row = await runtime.db
    .prepare('SELECT domain, via, zone_id, previous_catch_all FROM mailbox_domains WHERE domain = ? AND mailbox_id = ?')
    .bind(domain, mailboxId)
    .first<DomainRow>()
  if (row === null) throw new ApiError(404, ERROR_CODES.notFound, REFUSALS.notYours)
  if (row.via === 'catch_all' && row.zone_id !== null && runtime.cloudflare !== null) {
    const cloudflare = runtime.cloudflare
    const zoneId = row.zone_id
    const current = await cloudflareStep(() => cloudflare.catchAll(zoneId))
    if (pointsAt(current, runtime.workerName)) {
      const restore = (row.previous_catch_all === null ? null : parseCatchAll(row.previous_catch_all)) ?? NO_CATCH_ALL
      await cloudflareStep(() => cloudflare.setCatchAll(zoneId, restore))
    }
  }
  await runtime.db.prepare('DELETE FROM mailbox_domains WHERE domain = ? AND mailbox_id = ?').bind(domain, mailboxId).run()
}
