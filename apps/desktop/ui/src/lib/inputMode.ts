/** Keys that move focus or act on it: when one is pressed, the person is using the keyboard. */
const KEYBOARD = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' ', 'Escape', 'F6'])

/**
 * Keeps `<html data-input>` as `pointer` after a click or a tap and `keyboard` after a key that moves focus, so the
 * focus ring shows for the keyboard only (base.css). Started once, at launch.
 */
export function followInputMode(): void {
  const root = document.documentElement
  root.dataset['input'] = 'pointer'
  window.addEventListener('pointerdown', () => (root.dataset['input'] = 'pointer'), { capture: true, passive: true })
  window.addEventListener(
    'keydown',
    (event) => {
      if (KEYBOARD.has(event.key) && !event.metaKey && !event.ctrlKey) root.dataset['input'] = 'keyboard'
    },
    { capture: true, passive: true },
  )
}
