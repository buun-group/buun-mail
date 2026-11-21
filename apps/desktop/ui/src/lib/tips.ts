/**
 * Every open tooltip closes together when the page changes under it: a press anywhere, Escape, a scroll, the window
 * losing focus, or a dialog opening or closing. Without this a tip whose button a dialog covered never hears the
 * pointer leave, and stays up after the dialog closes.
 */
import { isPhone } from '../api/window'

const hiders = new Set<() => void>()
let watching = false

function hideAll(): void {
  for (const hide of hiders) hide()
}

function watch(): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener('pointerdown', hideAll, { capture: true, passive: true })
  window.addEventListener('wheel', hideAll, { capture: true, passive: true })
  window.addEventListener('scroll', hideAll, { capture: true, passive: true })
  window.addEventListener('blur', hideAll)
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') hideAll()
    },
    { capture: true },
  )
  new MutationObserver(hideAll).observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true })
}

/** Registers a tip's hide, to run with every other; returns the unregister. */
export function onHideTips(hide: () => void): () => void {
  watch()
  hiders.add(hide)
  return () => {
    hiders.delete(hide)
  }
}

/**
 * True when a tip may show for `element` now: it is still on the page, no open dialog covers it, and for focus, the
 * keyboard put it there. A phone has no hover: the mouse events a tap fakes never show a tip there.
 */
export function tipAllowed(element: Element, by: 'hover' | 'focus'): boolean {
  if (!element.isConnected || (by === 'hover' && isPhone)) return false
  if (by === 'focus' && (document.documentElement.dataset['input'] !== 'keyboard' || !element.matches(':focus-visible'))) return false
  const dialogs = [...document.querySelectorAll('dialog[open]')]
  const top = dialogs.at(-1)
  return top === undefined || top.contains(element)
}
