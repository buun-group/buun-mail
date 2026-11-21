import { isTauri } from '@tauri-apps/api/core'
import { exit, onBackButtonPress } from '@tauri-apps/api/app'
import { useEffect, useRef } from 'react'

import { isPhone } from '../api/window'

/**
 * Android's back button and gesture: `step` undoes the top-most thing open (compose, settings, the menu, a message)
 * and says whether it did; when nothing was open, back leaves the app, as every Android app does. iOS has no back
 * button, so nothing is registered there or on a computer.
 */
export function usePhoneBack(step: () => boolean): void {
  const latest = useRef(step)
  useEffect(() => {
    latest.current = step
  })
  useEffect(() => {
    if (!isPhone || !isTauri()) return undefined
    const listening = onBackButtonPress(() => {
      if (!latest.current()) void exit(0)
    })
    return () => void listening.then((listener) => listener.unregister())
  }, [])
}
