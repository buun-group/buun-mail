import { MAX_MESSAGE_BYTES, REFUSALS } from './constants'
import type { Runtime } from './lib/runtime'
import { mailboxForAddress } from './services/mailboxes'
import { receive } from './services/messages'
import type { IncomingEmail } from './types'

/** Reads a stream to the end, refusing past `limit` bytes so a message never fills memory. */
async function readAll(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

/**
 * The email handler: Email Routing's catch-all lands here. Mail for a domain no mailbox owns, or too large, is
 * refused at SMTP time so the sender hears about it. Everything else is stored and the mailbox's apps told.
 */
export async function handleEmail(runtime: Runtime, message: IncomingEmail): Promise<void> {
  const mailbox = await mailboxForAddress(runtime, message.to)
  if (mailbox === null) {
    message.setReject(REFUSALS.noMailbox)
    return
  }
  if (message.rawSize > MAX_MESSAGE_BYTES) {
    message.setReject(REFUSALS.tooLarge)
    return
  }
  const raw = await readAll(message.raw, MAX_MESSAGE_BYTES)
  if (raw === null) {
    message.setReject(REFUSALS.tooLarge)
    return
  }
  const stored = await receive(runtime, mailbox.id, { from: message.from, to: message.to }, raw)
  // An app that misses the push still finds the message on its next check; the push only makes it instant.
  await runtime.notify(mailbox.id, stored.id).catch(() => undefined)
}
