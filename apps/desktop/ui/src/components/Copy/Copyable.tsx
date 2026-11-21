import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { openExternal } from '../../api/client'
import { IconCheck, IconCopy } from '../../icons'
import { copyWithToast } from '../../lib/copy'
import type { CopyKind } from '../../lib/tokens'

import './Copy.css'

/** How long the copy glyph shows a tick after a copy. */
const TICK_MS = 1_200

/**
 * A word worth copying on its own: an email address, a code, or a link. Pointing at it shows a copy glyph; clicking
 * copies it (a link opens instead, and its glyph copies). `data-copy` lets the reader's menu offer it too.
 */
export function Copyable({ text, kind, className }: { text: string; kind: CopyKind; className?: string }): ReactNode {
  const { t } = useTranslation('mail')
  const [ticked, setTicked] = useState(false)
  // The tick goes after a moment, and its timer with the word when the word goes first.
  useEffect(() => {
    if (!ticked) return undefined
    const timer = window.setTimeout(() => setTicked(false), TICK_MS)
    return () => window.clearTimeout(timer)
  }, [ticked])
  const copy = (): void => {
    void copyWithToast(text).then((copied) => {
      if (copied) setTicked(true)
    })
  }
  const Glyph = ticked ? IconCheck : IconCopy
  const classes = `copyable copyable--${kind}${className === undefined ? '' : ` ${className}`}`

  if (kind === 'link') {
    return (
      <span className={classes} data-copy={text} data-kind={kind}>
        <a
          href={text}
          onClick={(event) => {
            event.preventDefault()
            void openExternal(text)
          }}
        >
          {text}
        </a>
        <button type="button" className="copyable__glyph" data-ticked={ticked} aria-label={t('copy.copyLink')} onClick={copy}>
          <Glyph aria-hidden="true" />
        </button>
      </span>
    )
  }
  return (
    <button type="button" className={classes} data-copy={text} data-kind={kind} aria-label={t('copy.copyThis', { text })} onClick={copy}>
      {text}
      <span className="copyable__glyph" data-ticked={ticked} aria-hidden="true">
        <Glyph />
      </span>
    </button>
  )
}
