import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { IconCaretDown, IconCheck } from '../../icons'
import { placeNear } from '../../lib/place'

import './Select.css'
import { holdAndLeave } from '../../lib/motion'

export interface SelectOption<V extends string> {
  value: V
  label: string
  /** A quieter second line, such as what a domain forwards to now. */
  hint?: string
  /** A small picture before the words, such as a language's flag or a glyph. Decorative. */
  icon?: ReactNode
}

interface SelectProps<V extends string> {
  /** Lets a `<label htmlFor>` name the field. */
  id: string
  value: V
  options: readonly SelectOption<V>[]
  onChange: (value: V) => void
  /** Shown, muted, while `value` matches no option. */
  placeholder?: string
  disabled?: boolean
  /** Extra class on the trigger, for width. */
  className?: string
}

/** The gap between the trigger and its list. */
const GAP = 4

/**
 * A drop-down in the app's own look instead of the system's: a trigger like the text fields, and a list that opens below
 * it (above when there is no room), at least as wide as the trigger and wider when an option needs it. Focus stays on
 * the trigger; arrow keys, Home, End and the first letter of an option move, Enter or Space chooses, Escape, Tab, a
 * click elsewhere or a scroll outside closes.
 */
export function Select<V extends string>({ id, value, options, onChange, placeholder, disabled = false, className }: SelectProps<V>): ReactNode {
  const listId = useId()
  const trigger = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLDivElement | null>(null)
  const listRef = useCallback((element: HTMLDivElement | null) => holdAndLeave(list, element), [])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)
  const [width, setWidth] = useState(0)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const chosen = options.findIndex((option) => option.value === value)
  const current = options[chosen]

  const close = useCallback(() => {
    setOpen(false)
    setPlace(null)
  }, [])

  const show = (): void => {
    if (disabled || options.length === 0) return
    setWidth(trigger.current?.offsetWidth ?? 0)
    // A modal <dialog> sits in the top layer, above the page body, so the list opens inside it.
    setHost(trigger.current?.closest('dialog') ?? document.body)
    setActive(Math.max(chosen, 0))
    setOpen(true)
  }

  const choose = (index: number): void => {
    const option = options[index]
    if (option === undefined) return
    onChange(option.value)
    close()
  }

  useLayoutEffect(() => {
    if (!open || trigger.current === null || list.current === null) return
    const anchor = trigger.current.getBoundingClientRect()
    const { width: listWidth, height } = list.current.getBoundingClientRect()
    setPlace(placeNear(anchor, { width: listWidth, height }, 'below', GAP, 'start'))
  }, [open])

  useLayoutEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null): boolean => target instanceof Node && (list.current?.contains(target) === true || trigger.current?.contains(target) === true)
    const away = (event: Event): void => {
      if (!inside(event.target)) close()
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('scroll', away, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [open, close])

  const onKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const last = options.length - 1
    const move = (index: number): void => {
      event.preventDefault()
      if (open) setActive(Math.min(Math.max(index, 0), last))
      else show()
    }
    if (event.key === 'ArrowDown') move(active + 1)
    else if (event.key === 'ArrowUp') move(active - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(last)
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(active)
      else show()
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') close()
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase()
      const from = open ? active : Math.max(chosen, 0)
      const order = [...options.keys()].map((step) => (from + 1 + step) % options.length)
      const found = order.find((index) => options[index]?.label.toLowerCase().startsWith(letter))
      if (found === undefined) return
      if (open) setActive(found)
      else choose(found)
    }
  }

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        className={className === undefined ? 'select' : `select ${className}`}
        data-open={open}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
      >
        {current?.icon !== undefined && <span className="select__icon">{current.icon}</span>}
        <span className="select__value" data-placeholder={current === undefined}>
          {current?.label ?? placeholder ?? ''}
        </span>
        <IconCaretDown aria-hidden="true" className="select__caret" />
      </button>
      {open &&
        host !== null &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={id}
            className="select__list"
            style={place === null ? { visibility: 'hidden', minWidth: width } : { left: place.left, top: place.top, minWidth: width }}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === chosen}
                data-active={index === active}
                className="select__option"
                onPointerMove={() => setActive(index)}
                onPointerDown={(event) => event.preventDefault()}
                tabIndex={-1}
                onClick={() => choose(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') choose(index)
                }}
              >
                {option.icon !== undefined && <span className="select__icon">{option.icon}</span>}
                <span className="select__words">
                  {option.label}
                  {option.hint !== undefined && <small>{option.hint}</small>}
                </span>
                {index === chosen && <IconCheck aria-hidden="true" className="select__check" />}
              </div>
            ))}
          </div>,
          host,
        )}
    </>
  )
}
