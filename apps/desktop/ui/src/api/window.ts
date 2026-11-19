import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * The window the app draws its own title bar for. Outside Tauri (`pnpm dev:ui`) there is no window to drive, so every
 * call is a no-op and `hasOwnTitleBar` is false.
 */

/** True on macOS, where the native traffic lights stay and the app only leaves room for them. */
export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || navigator.userAgent)

/**
 * True where the app draws minimise, maximise and close itself: Windows and Linux inside Tauri. In `pnpm dev:ui`,
 * adding `?controls` to the address draws them too (doing nothing), so the title bar can be reviewed in a browser.
 */
export const hasOwnTitleBar = (isTauri() && !isMac) || (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('controls'))

export async function minimizeWindow(): Promise<void> {
  if (isTauri()) await getCurrentWindow().minimize()
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (isTauri()) await getCurrentWindow().toggleMaximize()
}

export async function closeWindow(): Promise<void> {
  if (isTauri()) await getCurrentWindow().close()
}

/** Calls `onChange` with whether the window is maximised, now and after every resize. Returns the unsubscribe. */
export function watchMaximized(onChange: (maximized: boolean) => void): () => void {
  if (!isTauri()) return () => {}
  const window = getCurrentWindow()
  const check = (): void => void window.isMaximized().then(onChange)
  check()
  const stop = window.onResized(check)
  return () => void stop.then((unlisten) => unlisten())
}
