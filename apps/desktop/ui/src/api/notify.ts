import { isTauri } from '@tauri-apps/api/core'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

/** Whether the system lets the app show desktop notifications. False in a plain browser. */
export async function canNotify(): Promise<boolean> {
  return isTauri() ? isPermissionGranted() : false
}

/** Asks the system for permission. Resolves to whether it was given. */
export async function askToNotify(): Promise<boolean> {
  if (!isTauri()) return false
  return (await isPermissionGranted()) || (await requestPermission()) === 'granted'
}

/** Shows one desktop notification. Does nothing without permission or outside the desktop app. */
export async function notify(title: string, body: string): Promise<void> {
  if (await canNotify()) sendNotification({ title, body })
}
