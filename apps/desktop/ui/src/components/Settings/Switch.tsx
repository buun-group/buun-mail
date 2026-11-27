import type { ReactNode } from 'react'

/** An on and off switch: a real checkbox with the switch role, so it reads and toggles like one. */
export function Switch({ id, labelledBy, checked, onChange, disabled = false }: { id: string; labelledBy: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }): ReactNode {
  return (
    <span className="switch">
      <input id={id} type="checkbox" role="switch" aria-checked={checked} aria-labelledby={labelledBy} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch__track" aria-hidden="true" />
    </span>
  )
}
