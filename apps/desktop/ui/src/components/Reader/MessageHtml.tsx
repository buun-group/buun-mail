import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { openExternal } from '../../api/client'
import { IconShield } from '../../icons'
import { sealHtml } from '../../lib/sealHtml'

/**
 * The page the message is drawn on, sealed three ways: remote addresses are stripped from the HTML before it is drawn
 * (`sealHtml`), the frame runs no scripts (the sandbox allows none), and its own policy blocks every network fetch.
 * Pictures load only from the message itself until the person chooses Load images. Links open in the
 * browser, never inside the app.
 */
function pageFor(html: string, loadRemote: boolean): string {
  const remote = loadRemote ? ' https: http:' : ''
  const policy = `default-src 'none'; img-src data:${remote}; style-src 'unsafe-inline'${remote}; font-src data:${remote}; media-src data:`
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;padding:0;background:#fff;color:#1a1a1a;font:15px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}body{padding:20px}img{max-width:100%;height:auto}a{color:#2453c7}</style></head><body>${sealHtml(html, loadRemote)}</body></html>`
}

interface MessageHtmlProps {
  html: string
  /** How many remote pictures or styles the message asks for. */
  remote: number
}

/** A message as its sender laid it out, sealed in a frame, with remote pictures blocked until allowed. Keyed by message, so each starts blocked. */
export function MessageHtml({ html, remote }: MessageHtmlProps): ReactNode {
  const { t } = useTranslation('mail')
  const frame = useRef<HTMLIFrameElement | null>(null)
  const [loadRemote, setLoadRemote] = useState(false)
  const [height, setHeight] = useState(240)
  const [hover, setHover] = useState<string | null>(null)

  /** Fits the frame to its page, sends links to the browser, and shows where a link goes while it is pointed at. */
  const wire = useCallback(() => {
    const page = frame.current?.contentDocument
    if (page == null) return
    const fit = (): void => setHeight(Math.max(page.documentElement.scrollHeight, 120))
    fit()
    new ResizeObserver(fit).observe(page.documentElement)
    page.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (link === null) return
      event.preventDefault()
      const href = link.getAttribute('href') ?? ''
      if (/^(https?:|mailto:)/iu.test(href)) void openExternal(href)
    })
    page.addEventListener('mouseover', (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      setHover(link?.getAttribute('href') ?? null)
    })
    page.addEventListener('mouseleave', () => setHover(null))
  }, [])

  return (
    <div className="message-html">
      {remote > 0 && !loadRemote && (
        <p className="message-html__blocked">
          <IconShield aria-hidden="true" />
          <span>{t('html.remoteBlocked', { count: remote })}</span>
          <button type="button" onClick={() => setLoadRemote(true)}>
            {t('html.loadRemote')}
          </button>
        </p>
      )}
      <iframe ref={frame} className="message-html__frame" title={t('html.frame')} sandbox="allow-same-origin" srcDoc={pageFor(html, loadRemote)} style={{ height }} onLoad={wire} />
      {hover !== null && (
        <p className="message-html__link" role="status">
          {t('html.linkTo', { url: hover })}
        </p>
      )}
    </div>
  )
}
