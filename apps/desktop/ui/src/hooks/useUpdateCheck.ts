import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { checkForUpdate } from '../api/client'
import type { UpdateInfo } from '../api/types'
import { STORAGE_KEYS, UPDATE_CHECK_DELAY_MS, UPDATE_CHECK_EVERY_MS } from '../constants/ui'
import { IconRegenerate } from '../icons'
import { toast } from '../lib/feedback'

export interface UpdateCheck {
  /** What the last check found, this session. */
  found: UpdateInfo | null
  /** Why the last check failed, if it did. */
  problem: string | null
  /** Checks now; rejects with the reason, so a button can show it failed. */
  checkNow: () => Promise<UpdateInfo>
}

/** When the last check ran, and the newest version the person was already told about. */
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
 * Looks for a newer Buun Mail on the project's releases page: shortly after starting and then once a day while turned
 * on, plus whenever the person asks. A newer release is announced with a toast once per version.
 */
export function useUpdateCheck(enabled: boolean): UpdateCheck {
  const { t } = useTranslation('settings')
  const [found, setFound] = useState<UpdateInfo | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const run = useCallback(
    async (announce: boolean): Promise<UpdateInfo> => {
      try {
        const latest = await checkForUpdate()
        setFound(latest)
        setProblem(null)
        const before = readChecked()
        writeChecked({ at: Date.now(), told: latest.newer ? latest.latest : before.told })
        if (announce && latest.newer && before.told !== latest.latest) {
          toast({ text: t('updates.available', { version: latest.latest }), detail: t('updates.availableDetail'), tone: 'info', glyph: IconRegenerate })
        }
        return latest
      } catch (reason) {
        setProblem(reason instanceof Error ? reason.message : String(reason))
        throw reason
      }
    },
    [t],
  )

  useEffect(() => {
    if (!enabled) return
    const due = (): void => {
      if (Date.now() - readChecked().at >= UPDATE_CHECK_EVERY_MS) void run(true).catch(() => undefined)
    }
    const first = window.setTimeout(due, UPDATE_CHECK_DELAY_MS)
    // Hourly is enough to notice a day has passed while the app stays open.
    const hourly = window.setInterval(due, 60 * 60 * 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(hourly)
    }
  }, [enabled, run])

  const checkNow = useCallback(() => run(false), [run])
  return { found, problem, checkNow }
}
