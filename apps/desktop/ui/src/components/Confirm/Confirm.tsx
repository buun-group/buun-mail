import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import './Confirm.css'

export interface Confirmation {
  title: string
  body: string
  /** The words on the button that does it, such as "Delete forever". */
  action: string
  run: () => void
}

/**
 * Asks before something that cannot be undone. A modal dialog: Escape or Cancel keeps things as they are, and focus
 * starts on Cancel so Enter alone never deletes.
 */
export function Confirm({ request, cancelLabel, onClose }: { request: Confirmation | null; cancelLabel: string; onClose: () => void }): ReactNode {
  const dialog = useRef<HTMLDialogElement | null>(null)
  const cancel = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const element = dialog.current
    if (element === null) return
    if (request !== null && !element.open) {
      element.showModal()
      cancel.current?.focus()
    }
    if (request === null && element.open) element.close()
  }, [request])

  // Drawn at the top of the page wherever it is used, so a parent's layout (a flex bar, a grid list) never shapes it.
  return createPortal(
    <dialog ref={dialog} className="confirm" aria-labelledby="confirm-title" aria-describedby="confirm-body" onClose={onClose}>
      {request !== null && (
        <>
          <h2 id="confirm-title">{request.title}</h2>
          <p id="confirm-body">{request.body}</p>
          <div className="confirm__actions">
            <button ref={cancel} type="button" className="confirm__button" onClick={onClose}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className="confirm__button confirm__button--danger"
              onClick={() => {
                request.run()
                onClose()
              }}
            >
              {request.action}
            </button>
          </div>
        </>
      )}
    </dialog>,
    document.body,
  )
}
