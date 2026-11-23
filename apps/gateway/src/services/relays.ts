import { RELAY_KEY_PREFIX, TOKEN_BYTES } from '../constants'
import { randomHex, sha256Hex } from '../lib/crypto'
import { newId } from '../lib/ids'
import type { Runtime } from '../lib/runtime'

/** A relay, as the rest of the gateway sees it. */
export interface Relay {
  id: string
  mailboxId: string
  name: string
}

interface RelayRow {
  id: string
  mailbox_id: string
  name: string
}

const toRelay = (row: RelayRow): Relay => ({ id: row.id, mailboxId: row.mailbox_id, name: row.name })

/** The relay a key belongs to, or null. The key is hashed before the lookup; only hashes are stored. */
export async function relayForKey(runtime: Runtime, key: string): Promise<Relay | null> {
  if (!key.startsWith(RELAY_KEY_PREFIX)) return null
  const row = await runtime.db.prepare('SELECT id, mailbox_id, name FROM relays WHERE key_hash = ?').bind(await sha256Hex(key)).first<RelayRow>()
  return row === null ? null : toRelay(row)
}

/** Makes a relay for a mailbox and returns it with its key, which is shown once and never stored. */
export async function createRelay(runtime: Runtime, mailboxId: string, name: string): Promise<{ relay: Relay; key: string }> {
  const relay = { id: newId('mailRelay'), mailboxId, name }
  const key = `${RELAY_KEY_PREFIX}${randomHex(TOKEN_BYTES)}`
  await runtime.db
    .prepare('INSERT INTO relays (id, mailbox_id, name, key_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(relay.id, mailboxId, name, await sha256Hex(key), runtime.now())
    .run()
  return { relay, key }
}

/** A mailbox's relays, oldest first. */
export async function listRelays(runtime: Runtime, mailboxId: string): Promise<Relay[]> {
  const rows = await runtime.db.prepare('SELECT id, mailbox_id, name FROM relays WHERE mailbox_id = ? ORDER BY created_at').bind(mailboxId).all<RelayRow>()
  return rows.results.map(toRelay)
}

/** Removes a relay; its key stops working at once. Returns false when the mailbox has no such relay. */
export async function deleteRelay(runtime: Runtime, mailboxId: string, id: string): Promise<boolean> {
  const result = await runtime.db.prepare('DELETE FROM relays WHERE id = ? AND mailbox_id = ?').bind(id, mailboxId).run()
  return result.meta.changes === 1
}

/** True when a mailbox owns the domain of an address. */
export async function mailboxOwnsAddress(runtime: Runtime, mailboxId: string, address: string): Promise<boolean> {
  const domain = address.trim().toLowerCase().split('@')[1] ?? ''
  const row = await runtime.db.prepare('SELECT 1 AS owned FROM mailbox_domains WHERE domain = ? AND mailbox_id = ?').bind(domain, mailboxId).first<{ owned: number }>()
  return row !== null
}
