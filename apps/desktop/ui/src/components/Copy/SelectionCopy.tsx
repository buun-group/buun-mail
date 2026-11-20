import { useEffect, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { IconCopy } from '../../icons'
import { copyWithToast } from '../../lib/copy'

import './Copy.css'

/** The gap kept between the selection and the button above it. */
const GAP = 8

/**
 * A small Copy button over text selected inside `within`, so copying a few words is one click. It leaves when the
 * selection does, or on scroll.
 */
export function SelectionCopy({ within }: { within: RefObject<HTMLElement | null> }): ReactNode {
  const { t } = useTranslation('mail')
  const [spot, setSpot] = useState<{ left: number; top: number; text: string } | null>(null)

  useEffect(() => {
    const update = (): void => {
      const selection = window.getSelection()
      const text = selection?.toString().trim() ?? ''
      const area = within.current
      // A selection inside an HTML message's shadow root is that viewer's to offer.
      const inShadow = selection?.anchorNode instanceof Element && selection.anchorNode.shadowRoot !== null
      if (selection === null || text === '' || selection.rangeCount === 0 || area === null || !area.contains(selection.anchorNode) || inShadow) {
        setSpot(null)
        return
      }
      const box = selection.getRangeAt(0).getBoundingClientRect()
      setSpot({ left: box.left + box.width / 2, top: Math.max(box.top - GAP, GAP), text })
    }
    const clear = (): void => setSpot(null)
    document.addEventListener('selectionchange', update)
    // A right click opens a menu with its own Copy, so the button steps aside.
    document.addEventListener('contextmenu', clear)
    const area = within.current
    area?.addEventListener('scroll', clear, { passive: true })
    return () => {
      document.removeEventListener('selectionchange', update)
      document.removeEventListener('contextmenu', clear)
      area?.removeEventListener('scroll', clear)
    }
  }, [within])

  if (spot === null) return null
  return <SelectionCopyButton spot={spot} label={t('copy.copy')} onDone={() => setSpot(null)} />
}

/** The floating Copy button itself, at a point in the window, for a selection in the page or in a sealed frame. */
export function SelectionCopyButton({ spot, label, onDone }: { spot: { left: number; top: number; text: string }; label: string; onDone: () => void }): ReactNode {
  return createPortal(
    <button
      type="button"
      className="selection-copy"
      style={{ left: spot.left, top: spot.top }}
      onPointerDown={(event) => event.preventDefault()}
      onClick={(event) => {
        void copyWithToast(spot.text, undefined, event.currentTarget)
        onDone()
      }}
    >
      <IconCopy aria-hidden="true" />
      {label}
    </button>,
    document.body,
  )
}
