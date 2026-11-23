import { TOKEN_BYTES, TOKEN_PREFIX } from '../constants'
import { randomHex, sha256Hex } from '../lib/crypto'
import { newId } from '../lib/ids'
import type { Runtime } from '../lib/runtime'

/** A mailbox as the rest of the gateway sees it. */
export interface Mailbox {
  id: string
  name: string
}

/** The mailbox a token belongs to, or null. The token is hashed before the lookup; only hashes are stored. */
export async function mailboxForToken(runtime: Runtime, token: string): Promise<Mailbox | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null
  return runtime.db.prepare('SELECT id, name FROM mailboxes WHERE token_hash = ?').bind(await sha256Hex(token)).first<Mailbox>()
}

/** The mailbox that receives for an address's domain, or null when no mailbox owns it. */
export async function mailboxForAddress(runtime: Runtime, address: string): Promise<Mailbox | null> {
  const domain = address.trim().toLowerCase().split('@')[1]
  if (domain === undefined || domain === '') return null
  return runtime.db
    .prepare('SELECT m.id, m.name FROM mailbox_domains d JOIN mailboxes m ON m.id = d.mailbox_id WHERE d.domain = ?')
    .bind(domain)
    .first<Mailbox>()
}

/** A new token: the prefix and 256 random bits. */
export function newToken(): string {
  return `${TOKEN_PREFIX}${randomHex(TOKEN_BYTES)}`
}

/** Makes a mailbox for domains and returns it with its token, which is shown once and never stored. */
export async function createMailbox(runtime: Runtime, name: string, domains: string[]): Promise<{ mailbox: Mailbox; token: string }> {
  const mailbox = { id: newId('mailbox'), name }
  const token = newToken()
  await runtime.db.batch([
    runtime.db.prepare('INSERT INTO mailboxes (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)').bind(mailbox.id, name, await sha256Hex(token), runtime.now()),
    ...domains.map((domain) => runtime.db.prepare('INSERT INTO mailbox_domains (domain, mailbox_id) VALUES (?, ?)').bind(domain.trim().toLowerCase(), mailbox.id)),
  ])
  return { mailbox, token }
}

/** A mailbox with its domains, for the admin list. */
export interface MailboxSummary extends Mailbox {
  domains: string[]
  createdAt: number
}

/** Every mailbox, oldest first, with its domains. Two queries, whatever the number of mailboxes. */
export async function listMailboxes(runtime: Runtime): Promise<MailboxSummary[]> {
  const mailboxes = await runtime.db.prepare('SELECT id, name, created_at FROM mailboxes ORDER BY created_at').all<{ id: string; name: string; created_at: number }>()
  const domains = await runtime.db.prepare('SELECT domain, mailbox_id FROM mailbox_domains ORDER BY domain').all<{ domain: string; mailbox_id: string }>()
  return mailboxes.results.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    domains: domains.results.filter((domain) => domain.mailbox_id === row.id).map((domain) => domain.domain),
  }))
}

/** Renames a mailbox. Returns false when there is no such mailbox. */
export async function renameMailbox(runtime: Runtime, id: string, name: string): Promise<boolean> {
  const result = await runtime.db.prepare('UPDATE mailboxes SET name = ? WHERE id = ?').bind(name, id).run()
  return result.meta.changes === 1
}

/** Gives a mailbox a new token; the old one stops working at once. Returns the new token, or null for no mailbox. */
export async function rotateToken(runtime: Runtime, id: string): Promise<string | null> {
  const token = newToken()
  const result = await runtime.db.prepare('UPDATE mailboxes SET token_hash = ? WHERE id = ?').bind(await sha256Hex(token), id).run()
  return result.meta.changes === 1 ? token : null
}
