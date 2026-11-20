import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { checkForUpdate, installUpdate } from '../api/client'
import type { UpdateInfo } from '../api/types'
import { STORAGE_KEYS, UPDATE_CHECK_DELAY_MS, UPDATE_CHECK_EVERY_MS } from '../constants/ui'
import type { UpdateChannel } from '../constants/ui'
import { IconRegenerate } from '../icons'
import { toast } from '../lib/feedback'

export interface UpdateCheck {
  /** What the last check found, this session. */
  found: UpdateInfo | null
  /** Why the last check failed, if it did. */
  problem: string | null
  /** Checks now; rejects with the reason, so a button can show it failed. */
  checkNow: () => Promise<UpdateInfo>
  /** Downloads the found release's installer and opens it; rejects with the reason. */
  install: () => Promise<void>
  /** True while a newer release is found and the person has not dismissed it: the pop-up shows. */
  prompting: boolean
  /** Hides the pop-up for this version; the next version asks again. */
  dismiss: () => void
}

/** When the last check ran, and the version whose pop-up the person dismissed. */
interface Checked {
  at: number
  told: string | null
}

function readChecked(): Checked {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.updateChecked) ?? 'null')
    if (typeof parsed === 'object' && parsed !== null && 'at' in parsed && typeof parsed.at === 'number') {
      return { at: parsed.at, told: 'told' in parsed && typeof parsed.told === 'string' ? parsed.told : null }
    }
  } catch {
    // Storage can be off or hold something else; treat it as never checked.
  }
  return { at: 0, told: null }
}

function writeChecked(checked: Checked): void {
  try {
    localStorage.setItem(STORAGE_KEYS.updateChecked, JSON.stringify(checked))
  } catch {
    // Without storage the check simply runs again next time.
  }
}

/**
 * Looks for a newer Buun Mail on the project's releases pages, on the chosen channel (stable, or early releases with
 * betas): shortly after starting and then once a day while turned on, plus whenever the person asks or changes the
 * channel. A newer release shows a pop-up until it is installed or dismissed (once per version), and can be downloaded
 * and opened from here.
 */
export function useUpdateCheck(enabled: boolean, channel: UpdateChannel): UpdateCheck {
  const { t } = useTranslation('settings')
  const [found, setFound] = useState<UpdateInfo | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(() => readChecked().told)

  const run = useCallback(
    async (): Promise<UpdateInfo> => {
      try {
        const latest = await checkForUpdate(channel === 'early')
        setFound(latest)
        setProblem(null)
        writeChecked({ at: Date.now(), told: readChecked().told })
        return latest
      } catch (reason) {
        setProblem(reason instanceof Error ? reason.message : String(reason))
        throw reason
      }
    },
    [channel],
  )

  useEffect(() => {
    if (!enabled) return
    const due = (): void => {
      if (Date.now() - readChecked().at >= UPDATE_CHECK_EVERY_MS) void run().catch(() => undefined)
    }
    const first = window.setTimeout(due, UPDATE_CHECK_DELAY_MS)
    // Hourly is enough to notice a day has passed while the app stays open.
    const hourly = window.setInterval(due, 60 * 60 * 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(hourly)
    }
  }, [enabled, run])

  // Switching channel looks again at once, so the newest beta (or the way back to stable) shows straight away.
  const lastChannel = useRef(channel)
  useEffect(() => {
    if (lastChannel.current === channel) return
    lastChannel.current = channel
    void run().catch(() => undefined)
  }, [channel, run])

  const checkNow = useCallback(() => run(), [run])
  const dismiss = useCallback(() => {
    if (found === null) return
    setDismissed(found.latest)
    writeChecked({ at: readChecked().at, told: found.latest })
  }, [found])
  const install = useCallback(async () => {
    if (found === null || !found.newer) return
    try {
      const saved = await installUpdate(found.latest)
      setDismissed(found.latest)
      writeChecked({ at: readChecked().at, told: found.latest })
      toast({ text: t(saved.opens ? 'updates.opened' : 'updates.saved', { version: found.latest }), detail: saved.path, tone: 'done', glyph: IconRegenerate })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      toast({ text: t('updates.installFailed', { version: found.latest }), detail: message, tone: 'problem' })
      throw reason
    }
  }, [found, t])
  const prompting = found !== null && found.newer && dismissed !== found.latest
  return { found, problem, checkNow, install, prompting, dismiss }
}
