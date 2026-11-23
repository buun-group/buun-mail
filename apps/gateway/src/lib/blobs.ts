import type { Bucket, Database } from '../types'

/**
 * How large one stored part is. D1 holds a value of up to 2 MB; half a megabyte leaves room and keeps each write small,
 * so a 25 MiB message is about fifty rows.
 */
export const PART_BYTES = 512 * 1024

/** A stored part as D1 or SQLite hands it back. */
type StoredPart = ArrayBuffer | Uint8Array | number[]

/** One stored part as bytes, whichever shape the driver gave. */
function partBytes(data: StoredPart): Uint8Array {
  if (data instanceof Uint8Array) return data
  return Array.isArray(data) ? Uint8Array.from(data) : new Uint8Array(data)
}

/**
 * Raw messages in D1, as R2 would hold them: put, get and delete by key. Each message is split into parts of
 * [`PART_BYTES`] and read back in order.
 */
export function d1Bucket(db: Database): Bucket {
  return {
    put: async (key, value) => {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
      const parts = Math.max(1, Math.ceil(bytes.byteLength / PART_BYTES))
      await db.batch([
        db.prepare('DELETE FROM message_parts WHERE object_key = ?').bind(key),
        ...Array.from({ length: parts }, (_, index) =>
          db.prepare('INSERT INTO message_parts (object_key, part, data) VALUES (?, ?, ?)').bind(key, index, bytes.subarray(index * PART_BYTES, (index + 1) * PART_BYTES)),
        ),
      ])
    },
    get: async (key) => {
      const rows = await db.prepare('SELECT data FROM message_parts WHERE object_key = ? ORDER BY part').bind(key).all<{ data: StoredPart }>()
      if (rows.results.length === 0) return null
      const chunks = rows.results.map((row) => partBytes(row.data))
      const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
      const whole = new Uint8Array(total)
      let at = 0
      for (const chunk of chunks) {
        whole.set(chunk, at)
        at += chunk.byteLength
      }
      return { arrayBuffer: () => Promise.resolve(whole.buffer) }
    },
    delete: async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys]
      if (list.length === 0) return
      await db.prepare('DELETE FROM message_parts WHERE object_key IN (SELECT value FROM json_each(?))').bind(JSON.stringify(list)).run()
    },
  }
}

/**
 * Raw mail in R2 with D1 behind it: new mail is written to R2; a read tries R2 then D1, so mail stored before R2 was
 * turned on still reads; a delete clears both. Without R2 the gateway uses D1 alone.
 */
export function rawMailStore(r2: Bucket | undefined, db: Database): Bucket {
  const d1 = d1Bucket(db)
  if (r2 === undefined) return d1
  return {
    put: (key, value) => r2.put(key, value),
    get: async (key) => (await r2.get(key)) ?? d1.get(key),
    delete: async (keys) => {
      await Promise.all([r2.delete(keys), d1.delete(keys)])
    },
  }
}
