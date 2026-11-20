import type { MouseEvent, PointerEvent } from 'react'

/** True when a point lies outside the dialog's own box, so on its backdrop. */
function outside(element: HTMLDialogElement, x: number, y: number): boolean {
  const box = element.getBoundingClientRect()
  return x < box.left || x > box.right || y < box.top || y > box.bottom
}

/**
 * Closes a modal dialog when its backdrop is clicked: a press that starts and ends outside the dialog's box (both land
 * on the dialog element itself, since the backdrop belongs to it). A drag that starts inside, such as selecting text,
 * and ends outside does not close it. Spread on the `<dialog>`.
 */
export const closeOnBackdrop = {
  onPointerDown: (event: PointerEvent<HTMLDialogElement>): void => {
    const element = event.currentTarget
    element.dataset['pressedOutside'] = String(event.target === element && outside(element, event.clientX, event.clientY))
  },
  onClick: (event: MouseEvent<HTMLDialogElement>): void => {
    const element = event.currentTarget
    const started = element.dataset['pressedOutside'] === 'true'
    delete element.dataset['pressedOutside']
    if (started && event.target === element && outside(element, event.clientX, event.clientY)) element.close()
  },
}
