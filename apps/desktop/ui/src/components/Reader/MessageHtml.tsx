import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { openExternal } from '../../api/client'
import { IconShield } from '../../icons'
import { sealHtml } from '../../lib/sealHtml'
import { tokenize } from '../../lib/tokens'
import type { CopyKind } from '../../lib/tokens'
import { SelectionCopyButton } from '../Copy/SelectionCopy'

/**
 * The page the message is drawn on, sealed three ways: remote addresses are stripped from the HTML before it is drawn
 * (`sealHtml`), the frame runs no scripts (the sandbox allows none), and its own policy blocks every network fetch.
 * Pictures load only from the message itself until the person chooses Load images. Links open in the
 * browser, never inside the app.
 */
function pageFor(html: string, loadRemote: boolean): string {
  const remote = loadRemote ? ' https: http:' : ''
  const policy = `default-src 'none'; img-src data:${remote}; style-src 'unsafe-inline'${remote}; font-src data:${remote}; media-src data:`
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;padding:0;background:#fff;color:#1a1a1a;font:15px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}body{padding:20px}img{max-width:100%;height:auto}a{color:#2453c7}</style></head><body data-sealed="buun-mail">${sealHtml(html, loadRemote)}</body></html>`
}

/** What was under the pointer on a right click in the sealed page, in window coordinates. */
export interface HtmlMenu {
  x: number
  y: number
  /** The selected text, trimmed; empty when none. */
  selected: string
  /** The link's address, when the click was on a link. */
  link: string | null
  /** The link's own words, when the click was on a link. */
  linkText: string | null
  /** The picture's address, when the click was on one. */
  image: string | null
  /** An address, link or code word under the pointer. */
  word: { text: string; kind: CopyKind } | null
  /** The page's text, as it reads. */
  text: string
  /** Selects everything in the page. */
  selectAll: () => void
}

/**
 * An event's target as an element. `instanceof Element` is false for the frame's nodes, which belong to the frame's
 * own window, so this checks the node type instead.
 */
function elementOf(target: EventTarget | null): Element | null {
  return target !== null && (target as Node).nodeType === Node.ELEMENT_NODE ? (target as Element) : null
}

/** The gap kept between a selection and the Copy button above it. */
const GAP = 8

/** The word under a point in the page, when it is an address, a link or a code. */
function wordAt(page: Document, x: number, y: number): HtmlMenu['word'] {
  const caret = (page as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(x, y)
  const node = caret?.startContainer
  if (caret == null || node?.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  let start = caret.startOffset
  let end = caret.startOffset
  while (start > 0 && !/\s/u.test(text.charAt(start - 1))) start -= 1
  while (end < text.length && !/\s/u.test(text.charAt(end))) end += 1
  for (const token of tokenize(text.slice(start, end))) {
    if (token.kind !== 'text') return { text: token.text, kind: token.kind }
  }
  return null
}

interface MessageHtmlProps {
  html: string
  /** How many remote pictures or styles the message asks for. */
  remote: number
  /** A right click in the page: the reader opens its menu with what was under the pointer. */
  onMenu?: (menu: HtmlMenu) => void
}

/** A message as its sender laid it out, sealed in a frame, with remote pictures blocked until allowed. Keyed by message, so each starts blocked. */
export function MessageHtml({ html, remote, onMenu }: MessageHtmlProps): ReactNode {
  const { t } = useTranslation('mail')
  const frame = useRef<HTMLIFrameElement | null>(null)
  const menu = useRef(onMenu)
  const wired = useRef(new WeakSet<Document>())
  const [spot, setSpot] = useState<{ left: number; top: number; text: string } | null>(null)
  useLayoutEffect(() => {
    menu.current = onMenu
  })
  const [loadRemote, setLoadRemote] = useState(false)
  const [height, setHeight] = useState(240)
  const [hover, setHover] = useState<string | null>(null)

  /** Fits the frame to its page, sends links to the browser, and shows where a link goes while it is pointed at. */
  const wire = useCallback(() => {
    const page = frame.current?.contentDocument
    // Only the sealed page, once: not the blank page a frame starts on, and not twice when load and the check both see it.
    if (page == null || page.body?.dataset['sealed'] !== 'buun-mail' || wired.current.has(page)) return
    wired.current.add(page)
    const fit = (): void => setHeight(Math.max(page.documentElement.scrollHeight, 120))
    fit()
    // Each part on its own, so one an engine refuses (watching a node of another window) cannot stop the others.
    try {
      new ResizeObserver(fit).observe(page.documentElement)
    } catch {
      page.defaultView?.addEventListener('resize', fit)
    }
    page.querySelectorAll('img').forEach((picture) => picture.addEventListener('load', fit))
    page.addEventListener('click', (event) => {
      const link = elementOf(event.target)?.closest('a[href]') ?? null
      if (link === null) return
      event.preventDefault()
      const href = link.getAttribute('href') ?? ''
      if (/^(https?:|mailto:)/iu.test(href)) void openExternal(href)
    })
    page.addEventListener('mouseover', (event) => {
      const link = elementOf(event.target)?.closest('a[href]') ?? null
      setHover(link?.getAttribute('href') ?? null)
    })
    page.addEventListener('mouseleave', () => setHover(null))
    // Right click: the reader's own menu, with what was under the pointer.
    page.addEventListener('contextmenu', (event) => {
      const open = menu.current
      const box = frame.current?.getBoundingClientRect()
      if (open === undefined || box === undefined) return
      event.preventDefault()
      setSpot(null)
      const target = elementOf(event.target)
      const anchor = target?.closest('a[href]') ?? null
      const picture = target?.closest('img') ?? null
      open({
        x: box.left + event.clientX,
        y: box.top + event.clientY,
        selected: page.getSelection()?.toString().trim() ?? '',
        link: anchor?.getAttribute('href') ?? null,
        linkText: anchor?.textContent?.trim() || null,
        image: picture?.getAttribute('src') ?? picture?.getAttribute('data-blocked-src') ?? null,
        word: wordAt(page, event.clientX, event.clientY),
        text: page.body.innerText,
        selectAll: () => page.getSelection()?.selectAllChildren(page.body),
      })
    })
    // A selection in the page gets the same floating Copy button as plain text.
    page.addEventListener('selectionchange', () => {
      const selection = page.getSelection()
      const text = selection?.toString().trim() ?? ''
      const box = frame.current?.getBoundingClientRect()
      if (selection === null || text === '' || selection.rangeCount === 0 || box === undefined) {
        setSpot(null)
        return
      }
      const range = selection.getRangeAt(0).getBoundingClientRect()
      setSpot({ left: box.left + range.left + range.width / 2, top: Math.max(box.top + range.top - GAP, GAP), text })
    })
  }, [])

  // Some engines (WebKit) can finish a srcdoc page before the load handler is in place, so the page is also looked for
  // on every animation frame for two seconds after the frame mounts; wire() ignores the blank page and a second call.
  // The frame is keyed by whether remote images load, so allowing them mounts a fresh frame and looks again.
  const attachFrame = useCallback(
    (element: HTMLIFrameElement | null) => {
      frame.current = element
      if (element === null) return undefined
      let tries = 120
      let next = 0
      const look = (): void => {
        wire()
        const page = element.contentDocument
        tries -= 1
        if (tries > 0 && (page == null || !wired.current.has(page))) next = window.requestAnimationFrame(look)
      }
      look()
      return () => window.cancelAnimationFrame(next)
    },
    [wire],
  )

  useEffect(() => {
    const clear = (): void => setSpot(null)
    window.addEventListener('scroll', clear, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', clear, { capture: true })
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
      <iframe key={String(loadRemote)} ref={attachFrame} className="message-html__frame" title={t('html.frame')} sandbox="allow-same-origin" srcDoc={pageFor(html, loadRemote)} style={{ height }} onLoad={wire} />
      {spot !== null && <SelectionCopyButton spot={spot} label={t('copy.copy')} onDone={() => setSpot(null)} />}
      {hover !== null && (
        <p className="message-html__link" role="status">
          {t('html.linkTo', { url: hover })}
        </p>
      )}
    </div>
  )
}
