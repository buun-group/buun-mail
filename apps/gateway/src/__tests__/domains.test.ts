import { describe, expect, it } from 'vitest'

import { REFUSALS } from '../constants'
import { parseCatchAll } from '../lib/cloudflare'
import type { CatchAll } from '../lib/cloudflare'
import { WORKER, createHarness, createTestCloudflare } from './harness'

const FORWARD: CatchAll = { enabled: true, matchers: [{ type: 'all' }], actions: [{ type: 'forward', value: ['owner@mail.example'] }] }

const call = (token: string, method: string, body?: unknown): RequestInit => ({
  method,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

describe('the domains API', () => {
  it('lists the zones no mailbox owns, with what their catch-all does now', async () => {
    const cloudflare = createTestCloudflare([{ name: 'acme.example', catchAll: FORWARD }, { name: 'taken.example', catchAll: FORWARD }])
    const gateway = createHarness(cloudflare.api)
    const { token } = await gateway.mailbox('Acme', ['taken.example'])
    const answer = await gateway.request('/v1/domains/available', call(token, 'GET'))
    expect(await answer.json()).toEqual({ zones: [{ domain: 'acme.example', catchAllNow: 'forward owner@mail.example' }] })
  })

  it('adds a domain: turns routing on, keeps the old catch-all, points the catch-all here', async () => {
    const cloudflare = createTestCloudflare([{ name: 'acme.example', catchAll: FORWARD, routing: false }])
    const gateway = createHarness(cloudflare.api)
    const { token } = await gateway.mailbox('Acme', [])
    const answer = await gateway.request('/v1/domains', call(token, 'POST', { domain: 'Acme.example' }))
    expect(answer.status).toBe(201)
    expect(await answer.json()).toEqual({ domain: { domain: 'acme.example', via: 'catch_all', routedHere: true, previously: 'forward owner@mail.example' } })
    expect(cloudflare.enabled.has('zone-0')).toBe(true)
    expect(cloudflare.rules.get('zone-0')).toEqual({ enabled: true, matchers: [{ type: 'all' }], actions: [{ type: 'worker', value: [WORKER] }] })
    const listed = await gateway.request('/v1/domains', call(token, 'GET'))
    expect(await listed.json()).toEqual({ domains: [{ domain: 'acme.example', via: 'catch_all', routedHere: true, previously: 'forward owner@mail.example' }] })
  })

  it('removing a domain puts the old catch-all back', async () => {
    const cloudflare = createTestCloudflare([{ name: 'acme.example', catchAll: FORWARD }])
    const gateway = createHarness(cloudflare.api)
    const { token } = await gateway.mailbox('Acme', [])
    await gateway.request('/v1/domains', call(token, 'POST', { domain: 'acme.example' }))
    expect((await gateway.request('/v1/domains/acme.example', call(token, 'DELETE'))).status).toBe(204)
    expect(cloudflare.rules.get('zone-0')).toEqual(FORWARD)
    expect(await (await gateway.request('/v1/domains', call(token, 'GET'))).json()).toEqual({ domains: [] })
  })

  it('switches the catch-all off on removal when the stored one cannot be read', async () => {
    const cloudflare = createTestCloudflare([{ name: 'acme.example', catchAll: FORWARD }])
    const gateway = createHarness(cloudflare.api)
    const { token } = await gateway.mailbox('Acme', [])
    await gateway.request('/v1/domains', call(token, 'POST', { domain: 'acme.example' }))
    gateway.sqlite.prepare("UPDATE mailbox_domains SET previous_catch_all = 'not json'").run()
    await gateway.request('/v1/domains/acme.example', call(token, 'DELETE'))
    expect(cloudflare.rules.get('zone-0')?.enabled).toBe(false)
  })

  it('refuses a domain outside the account, one another mailbox owns, and a malformed one', async () => {
    const cloudflare = createTestCloudflare([{ name: 'acme.example', catchAll: FORWARD }])
    const gateway = createHarness(cloudflare.api)
    const first = await gateway.mailbox('First', [])
    const second = await gateway.mailbox('Second', [])
    await gateway.request('/v1/domains', call(first.token, 'POST', { domain: 'acme.example' }))

    const outside = await gateway.request('/v1/domains', call(second.token, 'POST', { domain: 'someone-else.example' }))
    expect([outside.status, ((await outside.json()) as { message: string }).message]).toEqual([404, REFUSALS.notInAccount])
    const taken = await gateway.request('/v1/domains', call(second.token, 'POST', { domain: 'acme.example' }))
    expect([taken.status, ((await taken.json()) as { message: string }).message]).toEqual([409, REFUSALS.taken])
    expect((await gateway.request('/v1/domains', call(second.token, 'POST', { domain: 'not a domain!' }))).status).toBe(400)
    const notYours = await gateway.request('/v1/domains/acme.example', call(second.token, 'DELETE'))
    expect([notYours.status, ((await notYours.json()) as { message: string }).message]).toEqual([404, REFUSALS.notYours])
  })

  it('records nothing when Cloudflare refuses the change', async () => {
    const cloudflare = createTestCloudflare([{ name: 'acme.example', catchAll: FORWARD }])
    cloudflare.state.fail = true
    const gateway = createHarness(cloudflare.api)
    const { token } = await gateway.mailbox('Acme', [])
    const answer = await gateway.request('/v1/domains', call(token, 'POST', { domain: 'acme.example' }))
    expect([answer.status, ((await answer.json()) as { message: string }).message]).toEqual([502, REFUSALS.cloudflare])
    expect(await (await gateway.request('/v1/domains', call(token, 'GET'))).json()).toEqual({ domains: [] })
  })

  it('says so when the gateway has no Cloudflare token', async () => {
    const gateway = createHarness(null)
    const { token } = await gateway.mailbox('Acme', [])
    const answer = await gateway.request('/v1/domains', call(token, 'POST', { domain: 'acme.example' }))
    expect([answer.status, ((await answer.json()) as { message: string }).message]).toEqual([503, REFUSALS.notConfigured])
  })
})

describe('parseCatchAll()', () => {
  it('reads a stored rule back', () => {
    expect(parseCatchAll(JSON.stringify(FORWARD))).toEqual(FORWARD)
  })

  it('returns null for text that is not a rule', () => {
    expect(parseCatchAll('not json')).toBeNull()
    expect(parseCatchAll('{"enabled":"yes"}')).toBeNull()
  })
})
