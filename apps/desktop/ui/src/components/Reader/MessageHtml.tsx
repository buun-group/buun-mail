import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { openExternal } from '../../api/client'
import { IconShield } from '../../icons'
import { sealDocument } from '../../lib/sealHtml'
import { tokenize } from '../../lib/tokens'
import type { CopyKind } from '../../lib/tokens'
import { SelectionCopyButton } from '../Copy/SelectionCopy'

/** What was under the pointer on a right click in the message, in window coordinates. */
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
  /** The message's text, as it reads. */
  text: string
  /** Selects the whole message. */
  selectAll: () => void
}

/** The gap kept between a selection and the Copy button above it. */
const GAP = 8

/**
 * The message's own look, inside its shadow root. A designed message sits on paper (soft in dark mode, with the grain
 * when it is on); a plain one takes the app's colours. Fixed-position content stays inside the box (`contain`).
 */
const BASE_CSS = `
:host { display: block; position: relative; contain: layout paint style; isolation: isolate; border-radius: var(--radius-md); }
.mail-body { position: relative; padding: 20px; overflow-x: auto; font: 15px/1.55 system-ui, sans-serif; overflow-wrap: anywhere; color: var(--mail-ink); background: var(--mail-paper); border-radius: inherit; box-shadow: inset 0 0 0 1px var(--mail-edge); }
.mail-body img { max-width: 100%; height: auto; }
.mail-body a { color: var(--mail-link); }
.mail-body > :first-child { margin-top: 0; }
.mail-body > :last-child { margin-bottom: 0; }
:host([data-plain]) .mail-body { padding: 0; color: var(--text-primary); background: transparent; box-shadow: none; font-size: var(--text-base); }
:host([data-plain]) .mail-body a { color: var(--brand-text); }
:host([data-grain]:not([data-plain])) .mail-body::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: var(--grain-image) 0 0 / 200px 200px; opacity: var(--mail-grain-opacity); mix-blend-mode: multiply; pointer-events: none; }
`

/** True when the message sets no colours or backgrounds of its own, so it can be drawn in the app's colours. */
function isPlain(page: Document): boolean {
  const styled = (text: string | null): boolean => text !== null && /(?:^|[;{\s])(?:background(?:-color|-image)?|color)\s*:/iu.test(text)
  if ([...page.querySelectorAll('style')].some((element) => styled(element.textContent))) return false
  return ![...page.querySelectorAll('*')].some((element) => element.hasAttribute('bgcolor') || element.hasAttribute('background') || element.localName === 'font' || styled(element.getAttribute('style')))
}

/** The message's own CSS with its `html` and `body` rules pointed at the box, since a shadow root has neither. */
function scopedCss(css: string): string {
  return css.replace(/(^|[\s,>+~}])html(?=[\s,{.:#[>+~])/gu, '$1:host').replace(/(^|[\s,>+~}])body(?=[\s,{.:#[>+~])/gu, '$1.mail-body')
}

/** An event's innermost target, across the shadow root's boundary. */
function innermost(event: Event): Element | null {
  const first = event.composedPath()[0]
  return first instanceof Element ? first : null
}

/** The word under a point in the message, when it is an address, a link or a code. */
function wordAt(root: ShadowRoot, x: number, y: number): HtmlMenu['word'] {
  const finder = document as Document & { caretPositionFromPoint?: (x: number, y: number, options?: { shadowRoots: ShadowRoot[] }) => { offsetNode: Node; offset: number } | null }
  const caret = finder.caretPositionFromPoint?.(x, y, { shadowRoots: [root] })
  const node = caret?.offsetNode
  if (caret == null || node?.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  let start = caret.offset
  let end = caret.offset
  while (start > 0 && !/\s/u.test(text.charAt(start - 1))) start -= 1
  while (end < text.length && !/\s/u.test(text.charAt(end))) end += 1
  for (const token of tokenize(text.slice(start, end))) {
    if (token.kind !== 'text') return { text: token.text, kind: token.kind }
  }
  return null
}

/** The selection inside the shadow root, where the engine can tell: its text and where it sits. */
function selectionIn(root: ShadowRoot): { text: string; box: DOMRect } | null {
  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ''
  if (selection === null || text === '' || selection.rangeCount === 0) return null
  const composed = (selection as Selection & { getComposedRanges?: (options: { shadowRoots: ShadowRoot[] }) => StaticRange[] }).getComposedRanges?.({ shadowRoots: [root] })[0]
  const range = document.createRange()
  if (composed !== undefined) {
    range.setStart(composed.startContainer, composed.startOffset)
    range.setEnd(composed.endContainer, composed.endOffset)
  } else {
    const own = (root as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.()
    if (own == null || own.rangeCount === 0) return null
    return { text, box: own.getRangeAt(0).getBoundingClientRect() }
  }
  return root.contains(range.startContainer) ? { text, box: range.getBoundingClientRect() } : null
}

interface MessageHtmlProps {
  html: string
  /** How many remote pictures or styles the message asks for. */
  remote: number
  /** The paper grain is on (Settings, General). */
  grain?: boolean
  /** A right click in the message: the reader opens its menu with what was under the pointer. */
  onMenu?: (menu: HtmlMenu) => void
}

/**
 * A message as its sender laid it out, sealed and drawn in its own shadow root, with remote pictures blocked until
 * allowed. Sealed: no script, frame, form or event attribute survives `sealDocument`, nothing reaches the web until the
 * person allows it, links open in the browser, and the message's styles cannot touch the app nor draw outside its box.
 * Drawn in the page rather than a frame, so right click, selection and copy work as everywhere else in the reader.
 * Keyed by message, so each starts blocked.
 */
export function MessageHtml({ html, remote, grain = false, onMenu }: MessageHtmlProps): ReactNode {
  const { t } = useTranslation('mail')
  const host = useRef<HTMLDivElement | null>(null)
  const menu = useRef(onMenu)
  const [loadRemote, setLoadRemote] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [spot, setSpot] = useState<{ left: number; top: number; text: string } | null>(null)
  useLayoutEffect(() => {
    menu.current = onMenu
  })

  // Draws the sealed message into the shadow root, importing nodes from the inert parsed document.
  useLayoutEffect(() => {
    const element = host.current
    if (element === null) return
    const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
    const page = sealDocument(html, loadRemote)
    const base = document.createElement('style')
    base.textContent = BASE_CSS
    const own = [...page.querySelectorAll('style')].map((style) => {
      const copy = document.createElement('style')
      copy.textContent = scopedCss(style.textContent ?? '')
      return copy
    })
    page.querySelectorAll('style').forEach((style) => style.remove())
    const body = document.createElement('div')
    body.className = 'mail-body'
    body.append(...[...page.body.childNodes].map((node) => document.importNode(node, true)))
    root.replaceChildren(base, ...own, body)
    element.toggleAttribute('data-plain', isPlain(page))
  }, [html, loadRemote])

  const attach = useCallback((element: HTMLDivElement | null) => {
    host.current = element
    if (element === null) return undefined
    const linkOf = (event: Event): Element | null => innermost(event)?.closest('a[href]') ?? null
    const click = (event: MouseEvent): void => {
      const link = linkOf(event)
      if (link === null) return
      event.preventDefault()
      const href = link.getAttribute('href') ?? ''
      if (/^(https?:|mailto:)/iu.test(href)) void openExternal(href)
    }
    const over = (event: MouseEvent): void => setHover(linkOf(event)?.getAttribute('href') ?? null)
    const leave = (): void => setHover(null)
    const context = (event: MouseEvent): void => {
      const open = menu.current
      const root = element.shadowRoot
      if (open === undefined || root === null) return
      event.preventDefault()
      // The reader's own menu for the rest of the message must not open as well.
      event.stopPropagation()
      setSpot(null)
      const target = innermost(event)
      const anchor = target?.closest('a[href]') ?? null
      const picture = target?.closest('img') ?? null
      const body = root.querySelector<HTMLElement>('.mail-body')
      open({
        x: event.clientX,
        y: event.clientY,
        selected: window.getSelection()?.toString().trim() ?? '',
        link: anchor?.getAttribute('href') ?? null,
        linkText: anchor?.textContent?.trim() || null,
        image: picture?.getAttribute('src') ?? picture?.getAttribute('data-blocked-src') ?? null,
        word: wordAt(root, event.clientX, event.clientY),
        text: body?.innerText ?? '',
        selectAll: () => {
          if (body !== null) window.getSelection()?.selectAllChildren(body)
        },
      })
    }
    element.addEventListener('click', click)
    element.addEventListener('mouseover', over)
    element.addEventListener('mouseleave', leave)
    element.addEventListener('contextmenu', context)
    return () => {
      element.removeEventListener('click', click)
      element.removeEventListener('mouseover', over)
      element.removeEventListener('mouseleave', leave)
      element.removeEventListener('contextmenu', context)
    }
  }, [])

  // A selection in the message gets the floating Copy button; it leaves on scroll.
  useEffect(() => {
    const update = (): void => {
      const root = host.current?.shadowRoot
      const found = root == null ? null : selectionIn(root)
      setSpot(found === null ? null : { left: found.box.left + found.box.width / 2, top: Math.max(found.box.top - GAP, GAP), text: found.text })
    }
    const clear = (): void => setSpot(null)
    document.addEventListener('selectionchange', update)
    window.addEventListener('scroll', clear, { capture: true, passive: true })
    return () => {
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', clear, { capture: true })
    }
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
      <div ref={attach} className="message-html__page" role="document" aria-label={t('html.frame')} data-grain={grain || undefined} />
      {spot !== null && <SelectionCopyButton spot={spot} label={t('copy.copy')} onDone={() => setSpot(null)} />}
      {hover !== null && (
        <p className="message-html__link" role="status">
          {t('html.linkTo', { url: hover })}
        </p>
      )}
    </div>
  )
}
