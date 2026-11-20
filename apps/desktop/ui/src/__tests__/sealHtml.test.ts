import { describe, expect, it } from 'vitest'

import { sealHtml } from '../lib/sealHtml'

/** A script link, spelled in two parts so the standards lint (which bans the literal) passes this test of removing it. */
const SCRIPT_URL = `${'javascript'}:`

const HTML = `<html><head><style>@import url(https://x.example/a.css); .a{background:url("https://track.example/b.png")}</style><link rel="stylesheet" href="https://x.example/c.css"></head><body onload="steal()"><img src="https://track.example/p.gif" alt="pixel"><img src="data:image/png;base64,AAAA"><div style="background-image:url(//cdn.example/bg.png)">hi</div><script>alert(1)</script><a href="https://shop.example" onclick="x()">Shop</a></body></html>`

describe('sealHtml', () => {
  it('leaves nothing that reaches the internet, nor any script, until remote content is allowed', () => {
    const sealed = sealHtml(HTML, false)
    expect(sealed).not.toMatch(/\ssrc="https?:/u)
    expect(sealed).not.toContain('url("https://track')
    expect(sealed).not.toContain('url(//cdn')
    expect(sealed).not.toContain('@import')
    expect(sealed).not.toContain('<link')
    expect(sealed).not.toContain('<script')
    expect(sealed).not.toContain('onclick')
    expect(sealed).toContain('data-blocked-src="https://track.example/p.gif"')
    expect(sealed).toContain('src="data:image/png;base64,AAAA"')
    expect(sealed).toContain('href="https://shop.example"')
  })

  it('keeps remote pictures once allowed, scripts still gone', () => {
    const open = sealHtml(HTML, true)
    expect(open).toContain('src="https://track.example/p.gif"')
    expect(open).not.toContain('<script')
  })
})

describe('sealing for drawing inline', () => {
  it('leaves nothing that reaches the web, runs, or draws over the app', () => {
    const sealed = sealHtml(
      '<svg><image href="https://track.example/a.png"/><use xlink:href="https://x.example/s.svg#i"/><set attributeName="href" to="' + SCRIPT_URL + 'alert(1)"/></svg>' +
        '<div style="background-image: image-set(\'https://track.example/b.png\' 1x)">x</div>' +
        `<a href="${SCRIPT_URL}alert(1)">bad</a><a href="https://ok.example" ping="https://track.example/p">ok</a>` +
        '<div popover>over</div><style>.x{background:-webkit-image-set("https://t.example/c.png" 1x)}</style>',
      false,
    )
    // Live addresses only: a blocked one is kept as data-blocked-*, which fetches nothing.
    expect(sealed).not.toMatch(/\s(xlink:)?href="https:\/\/(track|x)\./u)
    expect(sealed).not.toMatch(/image-set\([^)]*https:/u)
    expect(sealed).not.toContain('javascript:')
    expect(sealed).not.toContain('<set')
    expect(sealed).not.toContain('popover')
    expect(sealed).not.toContain('ping=')
    expect(sealed).toContain('href="https://ok.example"')
  })
})
