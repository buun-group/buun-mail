import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { IconType } from 'react-icons'

import { IconCheck } from '../../icons'

import './ContextMenu.css'

export interface MenuItem {
  id: string
  label: string
  glyph?: IconType
  onSelect?: () => void
  /** Why it is off, shown under the label. An item with a reason cannot be chosen. */
  disabledReason?: string
  /** Draws a hairline above the item. */
  separated?: boolean
  /** For a choice among several, such as a filter: whether this one is chosen. Shows a tick. */
  checked?: boolean
}

export interface MenuRequest {
  x: number
  y: number
  label: string
  items: MenuItem[]
}

/** True for the keys that open a context menu from the keyboard: the menu key, or Shift and F10. */
export function isMenuKey(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
}

/** Where to open a menu: at the pointer for a right click, under the row for the keyboard. */
export function menuPoint(event: MouseEvent | KeyboardEvent): { x: number; y: number } {
  if ('clientX' in event && event.clientX !== 0) return { x: event.clientX, y: event.clientY }
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: box.left + 24, y: box.bottom }
}

/** The gap kept between the menu and the window's edge. */
const EDGE = 8

/**
 * A right-click menu at the pointer, kept inside the window. Arrow keys, Home and End move, Enter chooses, Escape, a
 * click elsewhere or a scroll closes it, and focus goes back to where it was.
 */
export function ContextMenu({ request, onClose }: { request: MenuRequest; onClose: () => void }): ReactNode {
  const { t } = useTranslation('sidebar')
  const menu = useRef<HTMLDivElement | null>(null)
  const [place, setPlace] = useState({ left: request.x, top: request.y })
  const enabled = request.items.filter((item) => item.disabledReason === undefined)

  useLayoutEffect(() => {
    const element = menu.current
    if (element === null) return
    const { width, height } = element.getBoundingClientRect()
    setPlace({ left: Math.max(EDGE, Math.min(request.x, window.innerWidth - width - EDGE)), top: Math.max(EDGE, Math.min(request.y, window.innerHeight - height - EDGE)) })
    element.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus()
  }, [request])

  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const away = (event: Event): void => {
      if (!(event.target instanceof Node && menu.current?.contains(event.target))) onClose()
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('wheel', onClose, { passive: true })
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('wheel', onClose)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      returnTo?.focus()
    }
  }, [onClose])

  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const go = (index: number): void => items[(index + items.length) % items.length]?.focus()
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      go(at + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      go(at - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      go(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      go(items.length - 1)
    }
  }

  return (
    <div ref={menu} className="context-menu" role="menu" aria-label={request.label} tabIndex={-1} style={{ left: place.left, top: place.top }} onKeyDown={onKey}>
      {request.items.map((item) => {
        const off = item.disabledReason !== undefined
        const Glyph = item.glyph
        return (
          <button
            key={item.id}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={item.checked}
            aria-disabled={off || undefined}
            className="context-menu__item"
            data-separated={item.separated ?? false}
            onClick={() => {
              if (off) return
              onClose()
              item.onSelect?.()
            }}
          >
            {Glyph !== undefined ? <Glyph aria-hidden="true" /> : <span className="context-menu__blank" />}
            <span className="context-menu__words">
              {item.label}
              {off && <small>{item.disabledReason}</small>}
            </span>
            {item.checked === true && <IconCheck aria-hidden="true" className="context-menu__check" />}
          </button>
        )
      })}
      {enabled.length === 0 && <p className="context-menu__empty">{t('menu.empty')}</p>}
    </div>
  )
}
