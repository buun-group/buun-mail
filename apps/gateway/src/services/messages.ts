import { ACK_LIMIT, LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX, RETENTION_MS } from '../constants'
import { newId } from '../lib/ids'
import type { Runtime } from '../lib/runtime'

/** A waiting message, as the app sees it before fetching the bytes. */
export interface WaitingMessage {
  id: string
  envelopeFrom: string
  envelopeTo: string
  size: number
  receivedAt: number
}

interface MessageRow {
  id: string
  envelope_from: string
  envelope_to: string
  size: number
  received_at: number
}

/** How many expired messages one round of the daily clean-up removes. */
const PURGE_BATCH = 200

/** The most rounds one clean-up runs, so a run stays inside a Worker invocation's query limit. The rest go tomorrow. */
const PURGE_ROUNDS = 10

const toWaiting = (row: MessageRow): WaitingMessage => ({ id: row.id, envelopeFrom: row.envelope_from, envelopeTo: row.envelope_to, size: row.size, receivedAt: row.received_at })

/** Stores one received message: the bytes first, then the row, so a row never points at nothing. */
export async function receive(runtime: Runtime, mailboxId: string, envelope: { from: string; to: string }, raw: Uint8Array): Promise<WaitingMessage> {
  const id = newId('mailMessage')
  const objectKey = `${mailboxId}/${id}.eml`
  const receivedAt = runtime.now()
  await runtime.mail.put(objectKey, raw)
  await runtime.db
    .prepare('INSERT INTO messages (id, mailbox_id, envelope_from, envelope_to, size, object_key, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, mailboxId, envelope.from.toLowerCase(), envelope.to.toLowerCase(), raw.byteLength, objectKey, receivedAt)
    .run()
  return { id, envelopeFrom: envelope.from.toLowerCase(), envelopeTo: envelope.to.toLowerCase(), size: raw.byteLength, receivedAt }
}

/** Waiting messages, oldest first, so the app takes them in arrival order. */
export async function listWaiting(runtime: Runtime, mailboxId: string, limit = LIST_LIMIT_DEFAULT): Promise<WaitingMessage[]> {
  const rows = await runtime.db
    .prepare('SELECT id, envelope_from, envelope_to, size, received_at FROM messages WHERE mailbox_id = ? ORDER BY received_at, id LIMIT ?')
    .bind(mailboxId, Math.min(Math.max(limit, 1), LIST_LIMIT_MAX))
    .all<MessageRow>()
  return rows.results.map(toWaiting)
}

/** One waiting message's raw bytes, or null when it is not in this mailbox. */
export async function rawMessage(runtime: Runtime, mailboxId: string, id: string): Promise<ArrayBuffer | null> {
  const row = await runtime.db.prepare('SELECT object_key FROM messages WHERE id = ? AND mailbox_id = ?').bind(id, mailboxId).first<{ object_key: string }>()
  if (row === null) return null
  const object = await runtime.mail.get(row.object_key)
  return object === null ? null : object.arrayBuffer()
}

/**
 * Forgets messages the app has stored safely: the rows, then the bytes. Ids that are not this mailbox's are ignored.
 * Returns how many were removed.
 */
export async function acknowledge(runtime: Runtime, mailboxId: string, ids: string[]): Promise<number> {
  const wanted = [...new Set(ids)].slice(0, ACK_LIMIT)
  if (wanted.length === 0) return 0
  // The ids travel as one bound JSON array, read back with json_each, so the query text never changes.
  const list = JSON.stringify(wanted)
  const found = await runtime.db
    .prepare('SELECT id, object_key FROM messages WHERE mailbox_id = ? AND id IN (SELECT value FROM json_each(?))')
    .bind(mailboxId, list)
    .all<{ id: string; object_key: string }>()
  if (found.results.length === 0) return 0
  await runtime.db.prepare('DELETE FROM messages WHERE mailbox_id = ? AND id IN (SELECT value FROM json_each(?))').bind(mailboxId, list).run()
  await runtime.mail.delete(found.results.map((row) => row.object_key))
  return found.results.length
}

/**
 * Removes mail no app collected within the retention window, oldest first, in rounds of [`PURGE_BATCH`]. The age index
 * means an idle run reads nothing. Returns how many went.
 */
export async function purgeExpired(runtime: Runtime): Promise<number> {
  const cutoff = runtime.now() - RETENTION_MS
  let removed = 0
  for (let round = 0; round < PURGE_ROUNDS; round += 1) {
    const expired = await runtime.db
      .prepare('SELECT id, object_key FROM messages WHERE received_at < ? ORDER BY received_at LIMIT ?')
      .bind(cutoff, PURGE_BATCH)
      .all<{ id: string; object_key: string }>()
    if (expired.results.length === 0) break
    await runtime.db.prepare('DELETE FROM messages WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(expired.results.map((row) => row.id))).run()
    await runtime.mail.delete(expired.results.map((row) => row.object_key))
    removed += expired.results.length
    if (expired.results.length < PURGE_BATCH) break
  }
  return removed
}
