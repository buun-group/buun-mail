import { describe, expect, it } from 'vitest'

import { ERROR_CODES, REFUSALS, RETENTION_MS } from '../constants'
import { handleEmail } from '../email'
import { d1Bucket, PART_BYTES, rawMailStore } from '../lib/blobs'
import { listMailboxes, renameMailbox, rotateToken } from '../services/mailboxes'
import { purgeExpired } from '../services/messages'
import { auth, createHarness, createTestBucket, createTestDatabase, incoming } from './harness'

const RAW = 'From: a@client.example\r\nTo: billing@acme.example\r\nSubject: Invoice\r\n\r\nHello.\r\n'

describe('handleEmail()', () => {
  it('stores mail for a domain a mailbox owns, with the exact envelope recipient, and tells its apps', async () => {
    const gateway = createHarness()
    const { mailbox } = await gateway.mailbox('Acme', ['Acme.example'])
    const message = incoming('A@Client.example', 'Billing+March@acme.example', RAW)
    await handleEmail(gateway.runtime, message)
    expect(message.rejected).toBeNull()
    const rows = gateway.sqlite.prepare('SELECT mailbox_id, envelope_from, envelope_to, size FROM messages').all()
    expect(rows).toEqual([{ mailbox_id: mailbox.id, envelope_from: 'a@client.example', envelope_to: 'billing+march@acme.example', size: RAW.length }])
    expect(gateway.mail.objects.size).toBe(1)
    expect(gateway.notified).toHaveLength(1)
  })

  it('refuses mail for a domain no mailbox owns, at SMTP time, and stores nothing', async () => {
    const gateway = createHarness()
    await gateway.mailbox('Acme', ['acme.example'])
    const message = incoming('a@b.example', 'x@globex.example', RAW)
    await handleEmail(gateway.runtime, message)
    expect(message.rejected).toBe(REFUSALS.noMailbox)
    expect(gateway.mail.objects.size).toBe(0)
  })

  it('refuses a message larger than the limit', async () => {
    const gateway = createHarness()
    await gateway.mailbox('Acme', ['acme.example'])
    const message = incoming('a@b.example', 'x@acme.example', RAW, 26 * 1024 * 1024)
    await handleEmail(gateway.runtime, message)
    expect(message.rejected).toBe(REFUSALS.tooLarge)
  })
})

describe('createMailbox()', () => {
  it('keeps only a hash of the token', async () => {
    const gateway = createHarness()
    const { token } = await gateway.mailbox('Acme', ['acme.example'])
    expect(token).toMatch(/^bmg_[0-9a-f]{64}$/)
    expect(JSON.stringify(gateway.sqlite.prepare('SELECT * FROM mailboxes').all())).not.toContain(token)
  })
})

describe('the app API', () => {
  it('refuses a missing, malformed or unknown token with the same answer', async () => {
    const gateway = createHarness()
    await gateway.mailbox('Acme', ['acme.example'])
    const answers = await Promise.all([
      gateway.request('/v1/messages'),
      gateway.request('/v1/messages', { headers: { Authorization: 'Basic abc' } }),
      gateway.request('/v1/messages', auth('bmg_0000')),
      gateway.request('/v1/messages', auth('not-a-token')),
    ])
    for (const answer of answers) {
      expect(answer.status).toBe(401)
      expect(await answer.json()).toEqual({ error: true, errorCode: ERROR_CODES.authMissing, message: REFUSALS.unauthorized, requestId: answer.headers.get('X-Request-Id') })
    }
  })

  it('answers a request that fails its schema with the validation envelope', async () => {
    const gateway = createHarness()
    const acme = await gateway.mailbox('Acme', ['acme.example'])
    const answer = await gateway.request('/v1/messages?limit=0', auth(acme.token))
    expect(answer.status).toBe(400)
    expect(await answer.json()).toMatchObject({ error: true, errorCode: ERROR_CODES.validationFailed, message: REFUSALS.invalid })
  })

  it("reuses Cloudflare's ray id as the request id", async () => {
    const gateway = createHarness()
    const answer = await gateway.request('/health', { headers: { 'cf-ray': '8f00aa11bb22cc33-SYD' } })
    expect(answer.headers.get('X-Request-Id')).toBe('8f00aa11bb22cc33-SYD')
  })

  it('answers an unknown path with the not-found envelope', async () => {
    const gateway = createHarness()
    const answer = await gateway.request('/v2/anything')
    expect(answer.status).toBe(404)
    expect(await answer.json()).toMatchObject({ error: true, errorCode: ERROR_CODES.notFound, message: REFUSALS.nothingHere })
  })

  it('hides an unexpected failure behind the generic internal envelope', async () => {
    const gateway = createHarness()
    const acme = await gateway.mailbox('Acme', ['acme.example'])
    gateway.sqlite.exec('DROP TABLE messages')
    const answer = await gateway.request('/v1/messages', auth(acme.token))
    expect(answer.status).toBe(500)
    const body = (await answer.json()) as { errorCode: string; message: string }
    expect([body.errorCode, body.message]).toEqual([ERROR_CODES.internal, REFUSALS.internal])
  })

  it('publishes an OpenAPI document listing every /v1 route', async () => {
    const gateway = createHarness()
    const document = (await (await gateway.request('/openapi.json')).json()) as { paths: Record<string, unknown> }
    expect(Object.keys(document.paths).sort()).toEqual([
      '/v1/domains',
      '/v1/domains/available',
      '/v1/domains/{domain}',
      '/v1/messages',
      '/v1/messages/ack',
      '/v1/messages/collect',
      '/v1/messages/{id}/raw',
      '/v1/relay/messages',
      '/v1/stream',
    ])
  })

  it('lists waiting mail oldest first, and only the mailbox the token opens', async () => {
    const gateway = createHarness()
    const acme = await gateway.mailbox('Acme', ['acme.example'])
    await gateway.mailbox('Globex', ['globex.example'])
    await handleEmail(gateway.runtime, incoming('a@b.example', 'first@acme.example', RAW))
    gateway.advance(1000)
    await handleEmail(gateway.runtime, incoming('a@b.example', 'second@acme.example', RAW))
    await handleEmail(gateway.runtime, incoming('a@b.example', 'other@globex.example', RAW))

    const answer = await gateway.request('/v1/messages', auth(acme.token))
    const { messages } = (await answer.json()) as { messages: { envelopeTo: string }[] }
    expect(messages.map((message) => message.envelopeTo)).toEqual(['first@acme.example', 'second@acme.example'])
  })

  it("serves the raw bytes, and never another mailbox's message", async () => {
    const gateway = createHarness()
    const acme = await gateway.mailbox('Acme', ['acme.example'])
    const globex = await gateway.mailbox('Globex', ['globex.example'])
    await handleEmail(gateway.runtime, incoming('a@b.example', 'x@acme.example', RAW))
    const [id = ''] = gateway.messageIds()

    const mine = await gateway.request(`/v1/messages/${id}/raw`, auth(acme.token))
    expect(mine.status).toBe(200)
    expect(mine.headers.get('Content-Type')).toBe('message/rfc822')
    expect(await mine.text()).toBe(RAW)
    expect((await gateway.request(`/v1/messages/${id}/raw`, auth(globex.token))).status).toBe(404)
  })

  it("forgets acknowledged mail, bytes and all, and ignores ids that are not the mailbox's", async () => {
    const gateway = createHarness()
    const acme = await gateway.mailbox('Acme', ['acme.example'])
    const globex = await gateway.mailbox('Globex', ['globex.example'])
    await handleEmail(gateway.runtime, incoming('a@b.example', 'x@acme.example', RAW))
    const [id = ''] = gateway.messageIds()
    const ack = (token: string, ids: unknown) =>
      gateway.request('/v1/messages/ack', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })

    expect(await (await ack(globex.token, [id])).json()).toEqual({ acknowledged: 0 })
    expect(await (await ack(acme.token, [id, id])).json()).toEqual({ acknowledged: 1 })
    expect(gateway.mail.objects.size).toBe(0)
    expect((await ack(acme.token, [])).status).toBe(400)
    expect((await ack(acme.token, ['not-an-id'])).status).toBe(400)
  })

  it('asks for a WebSocket on the stream', async () => {
    const gateway = createHarness()
    const acme = await gateway.mailbox('Acme', ['acme.example'])
    expect((await gateway.request('/v1/stream', auth(acme.token))).status).toBe(426)
    expect((await gateway.request('/v1/stream', { headers: { Authorization: `Bearer ${acme.token}`, Upgrade: 'websocket' } })).status).toBe(200)
  })

  it('answers the health check without a token', async () => {
    const gateway = createHarness()
    expect(await (await gateway.request('/health')).json()).toEqual({ ok: true })
  })
})

describe('purgeExpired()', () => {
  it('drops mail nobody collected within the retention window', async () => {
    const gateway = createHarness()
    await gateway.mailbox('Acme', ['acme.example'])
    await handleEmail(gateway.runtime, incoming('a@b.example', 'x@acme.example', RAW))
    expect(await purgeExpired(gateway.runtime)).toBe(0)
    gateway.advance(RETENTION_MS + 1)
    expect(await purgeExpired(gateway.runtime)).toBe(1)
    expect(gateway.mail.objects.size).toBe(0)
  })

  it('seeks the age index instead of scanning the queue', () => {
    const { sqlite } = createTestDatabase()
    const plan = sqlite.prepare('EXPLAIN QUERY PLAN SELECT id, object_key FROM messages WHERE received_at < ? ORDER BY received_at LIMIT ?').all(0, 1)
    expect(JSON.stringify(plan)).toContain('messages_by_age')
  })
})

describe('mailbox admin', () => {
  it('lists, renames and replaces a token, and the old token stops working', async () => {
    const gateway = createHarness()
    const { mailbox, token } = await gateway.mailbox('Acme', ['acme.example', 'acme.test'])
    expect(await renameMailbox(gateway.runtime, mailbox.id, 'Acme Pty Ltd')).toBe(true)
    expect(await listMailboxes(gateway.runtime)).toEqual([expect.objectContaining({ id: mailbox.id, name: 'Acme Pty Ltd', domains: ['acme.example', 'acme.test'] })])
    const fresh = await rotateToken(gateway.runtime, mailbox.id)
    expect((await gateway.request('/v1/messages', auth(token))).status).toBe(401)
    expect((await gateway.request('/v1/messages', auth(fresh ?? ''))).status).toBe(200)
    expect(await rotateToken(gateway.runtime, 'mbx_nobody')).toBeNull()
  })
})

describe('d1Bucket()', () => {
  it('splits a large message into parts and reads it back whole, then deletes every part', async () => {
    const { db, sqlite } = createTestDatabase()
    const bucket = d1Bucket(db)
    const big = new Uint8Array(PART_BYTES * 2 + 123).map((_, index) => index % 251)
    await bucket.put('mbx_a/mml_1.eml', big)
    expect(sqlite.prepare('SELECT COUNT(*) AS parts FROM message_parts').get()?.['parts']).toBe(3)
    const back = new Uint8Array(await ((await bucket.get('mbx_a/mml_1.eml'))?.arrayBuffer() ?? new ArrayBuffer(0)))
    expect(back).toEqual(big)
    await bucket.delete(['mbx_a/mml_1.eml'])
    expect(await bucket.get('mbx_a/mml_1.eml')).toBeNull()
  })
})

describe('rawMailStore()', () => {
  it('writes new mail to R2, still reads mail stored in D1 before, and deletes from both', async () => {
    const { db } = createTestDatabase()
    const r2 = createTestBucket()
    await d1Bucket(db).put('mbx_a/old.eml', new TextEncoder().encode('stored in D1 before R2'))

    const store = rawMailStore(r2, db)
    await store.put('mbx_a/new.eml', new TextEncoder().encode('new mail'))
    expect(r2.objects.has('mbx_a/new.eml')).toBe(true)
    const read = async (key: string) => new TextDecoder().decode(await ((await store.get(key))?.arrayBuffer() ?? new ArrayBuffer(0)))
    expect(await read('mbx_a/new.eml')).toBe('new mail')
    expect(await read('mbx_a/old.eml')).toBe('stored in D1 before R2')

    await store.delete(['mbx_a/new.eml', 'mbx_a/old.eml'])
    expect(await store.get('mbx_a/old.eml')).toBeNull()
    expect(r2.objects.size).toBe(0)
  })

  it('uses D1 alone when the account has no R2', async () => {
    const { db, sqlite } = createTestDatabase()
    await rawMailStore(undefined, db).put('mbx_a/x.eml', new Uint8Array([1, 2, 3]))
    expect(sqlite.prepare('SELECT COUNT(*) AS parts FROM message_parts').get()?.['parts']).toBe(1)
  })
})
