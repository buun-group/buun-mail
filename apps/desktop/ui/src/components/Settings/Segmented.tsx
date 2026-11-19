import type { ReactNode } from 'react'

interface SegmentedProps<T extends string> {
  name: string
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onChange: (value: T) => void
}

/** A row of radio buttons drawn as one control: arrow keys move between them, as radios do. */
export function Segmented<T extends string>({ name, options, labels, value, onChange }: SegmentedProps<T>): ReactNode {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <label key={option} className="segmented__option">
          <input type="radio" id={`${name}-${option}`} name={name} value={option} checked={option === value} onChange={() => onChange(option)} />
          <span>{labels[option]}</span>
        </label>
      ))}
    </div>
  )
}
