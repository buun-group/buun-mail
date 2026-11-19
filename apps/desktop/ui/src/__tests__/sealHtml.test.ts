import { describe, expect, it } from 'vitest'

import { sealHtml } from '../lib/sealHtml'

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
