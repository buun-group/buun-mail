import type { ReactNode } from 'react'

import type { Message, Workspace } from '../../api/types'
import type { Theme } from '../../constants/ui'
import { IconArchive, IconReply, IconRoute } from '../../icons'
import { formatFull } from '../../lib/time'
import { MoreFromBuun } from '../MoreFromBuun/MoreFromBuun'
import { WindowControls } from '../WindowControls/WindowControls'

import './Reader.css'

interface ReaderProps {
  message: Message | null
  /** The message's text, null while it loads. */
  body: string | null
  workspace: Workspace | undefined
  theme: Theme
}

/** Why a message is where it is, in one plain sentence from the rules the router used. */
function RouteNote({ message, workspace }: { message: Message; workspace: Workspace | undefined }): ReactNode {
  if (message.matched === null) return <>No rule claims this address yet, so it waits in Unsorted.</>
  return (
    <>
      {workspace?.name} because it was sent to <code>{message.matched}</code>
      {message.folderMatched !== null && (
        <>
          , {message.folder} because it is from <code>{message.folderMatched}</code>
        </>
      )}
    </>
  )
}

/** The open message. With nothing open, the other Buun Group products. */
export function Reader({ message, body, workspace, theme }: ReaderProps): ReactNode {
  if (message === null) {
    return (
      <section className="reader" aria-label="Reader">
        <div className="reader__toolbar" data-tauri-drag-region>
          <WindowControls />
        </div>
        <div className="reader__empty">
          <p className="reader__nothing">Pick a message to read it.</p>
          <MoreFromBuun theme={theme} />
        </div>
      </section>
    )
  }

  return (
    <section className="reader" aria-label="Reader">
      <div className="reader__toolbar" data-tauri-drag-region>
        <button type="button" className="reader__tool" disabled aria-label={`Reply as ${message.to}`}>
          <IconReply aria-hidden="true" />
        </button>
        <button type="button" className="reader__tool" disabled aria-label="Archive">
          <IconArchive aria-hidden="true" />
        </button>
        <span className="reader__soon" data-tauri-drag-region>
          Reply and archive arrive with sending.
        </span>
        <WindowControls />
      </div>

      <article className="reader__message">
        <h2>{message.subject}</h2>
        <div className="reader__people">
          <span className="reader__from">{message.fromName}</span>
          <span className="reader__address">{message.from}</span>
          <time className="reader__when" dateTime={message.receivedAt}>
            {formatFull(message.receivedAt)}
          </time>
        </div>
        <p className="reader__to">
          to <span className="reader__address">{message.to}</span>
        </p>
        <p className="reader__route">
          <IconRoute aria-hidden="true" />
          <span>
            <RouteNote message={message} workspace={workspace} />
          </span>
        </p>
        <div className="reader__body" aria-busy={body === null}>
          {(body ?? message.preview).split(/\n{2,}/).map((paragraph, index) => (
            // Paragraphs have no id of their own; their order is fixed for a message.
            // eslint-disable-next-line react/no-array-index-key
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </article>
    </section>
  )
}
