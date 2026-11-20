import type { SyntheticEvent } from 'react'

/** How long the space a dissolved item took takes to close. */
export const COLLAPSE_MS = 200

/** How long anything closing takes to leave: quicker than arriving, so closing never feels like waiting. */
export const LEAVE_MS = 150

/** The latest a leave may run before it is cut short, in case its animation never reports that it ended. */
const LEAVE_LIMIT_MS = 400

/** True when the person asked for less motion: then things open and close at once. */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Runs `then` once `element`'s own animation ends, or after the limit, whichever comes first. */
function afterAnimation(element: HTMLElement, then: () => void): void {
  let done = false
  const finish = (): void => {
    if (done) return
    done = true
    window.clearTimeout(timer)
    element.removeEventListener('animationend', ended)
    then()
  }
  const ended = (event: AnimationEvent): void => {
    if (event.target === element) finish()
  }
  const timer = window.setTimeout(finish, LEAVE_LIMIT_MS)
  element.addEventListener('animationend', ended)
}

/**
 * Closes a modal dialog smoothly: it and its backdrop fade out first (`dialog[data-closing]` in base.css), then it
 * closes, which fires its `close` event as usual. At once with reduced motion.
 */
export function closeDialog(element: HTMLDialogElement | null): void {
  if (element === null || !element.open || element.dataset['closing'] === 'true') return
  if (reducedMotion()) {
    element.close()
    return
  }
  element.dataset['closing'] = 'true'
  afterAnimation(element, () => {
    delete element.dataset['closing']
    if (element.open) element.close()
  })
}

/** For a dialog's `onCancel` (Escape): leave smoothly instead of vanishing. */
export function cancelSmoothly(event: SyntheticEvent<HTMLDialogElement>): void {
  event.preventDefault()
  closeDialog(event.currentTarget)
}

/**
 * Leaves a fading copy of an element that is about to go, where it was, so a menu or a panel closes smoothly however
 * its parent removed it. Call as the element is being removed: it is measured at once, and copied and shown only if it
 * really left (React's development rehearsal detaches refs without removing anything).
 */
export function leaveBehind(element: HTMLElement, animation = 'leave'): void {
  if (reducedMotion() || !element.isConnected) return
  const box = element.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return
  const { zIndex, transformOrigin } = getComputedStyle(element)
  const host = element.parentElement
  queueMicrotask(() => {
    if (element.isConnected) return
    const ghost = element.cloneNode(true) as HTMLElement
    ghost.removeAttribute('id')
    for (const named of ghost.querySelectorAll('[id]')) named.removeAttribute('id')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${box.left}px`,
      top: `${box.top}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${box.width}px`,
      height: `${box.height}px`,
      margin: '0',
      zIndex,
      transformOrigin,
      pointerEvents: 'none',
      visibility: 'visible',
      animation: `${animation} ${LEAVE_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards`,
    })
    const place = host?.isConnected === true ? host : document.body
    place.append(ghost)
    afterAnimation(ghost, () => ghost.remove())
  })
}

/**
 * The body of a ref callback for a part that should fade out where it was when it goes (a menu, a popover, a panel):
 * points `ref` at the element and hands back the cleanup that leaves a fading copy. Use inside a `useCallback`:
 * `const attach = useCallback((element) => holdAndLeave(box, element), [])`.
 */
export function holdAndLeave<T extends HTMLElement>(ref: { current: T | null }, element: T | null, animation = 'leave'): (() => void) | undefined {
  ref.current = element
  if (element === null) return undefined
  return () => {
    ref.current = null
    leaveBehind(element, animation)
  }
}
