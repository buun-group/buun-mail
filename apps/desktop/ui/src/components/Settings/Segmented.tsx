import type { ReactNode } from 'react'
import type { IconType } from 'react-icons'

interface SegmentedProps<T extends string> {
  name: string
  /** The id of the visible words that name the choice, read out with the group. */
  labelledBy: string
  options: readonly T[]
  labels: Record<T, string>
  glyphs?: Record<T, IconType>
  value: T
  onChange: (value: T) => void
}

/** A row of radio buttons drawn as one control, each with an optional glyph. Arrow keys move between them, as radios do. */
export function Segmented<T extends string>({ name, labelledBy, options, labels, glyphs, value, onChange }: SegmentedProps<T>): ReactNode {
  return (
    <div className="segmented" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((option) => {
        const Glyph: IconType | undefined = glyphs?.[option]
        return (
          <label key={option} className="segmented__option">
            <input type="radio" id={`${name}-${option}`} name={name} value={option} checked={option === value} onChange={() => onChange(option)} />
            <span>
              {Glyph !== undefined && <Glyph aria-hidden="true" />}
              {labels[option]}
            </span>
          </label>
        )
      })}
    </div>
  )
}
