import type { ReactNode } from 'react'

import type { Message, Workspace } from '../../api/types'
import { PRODUCTS } from '../../constants/products'
import type { Theme } from '../../constants/ui'
import { formatFull } from '../../lib/time'
import { IconReply, IconRoute } from '../../icons'
import { ProductFeature } from '../ProductFeature/ProductFeature'

import './Reader.css'

interface ReaderProps {
  message: Message | null
  workspace: Workspace | undefined
  theme: Theme
  /** Which product fills the empty reader; the app steps it each time the reader empties. */
  featureIndex: number
}

/** The open message, with the rules that routed it. With nothing open, one Buun Group product in full. */
export function Reader({ message, workspace, theme, featureIndex }: ReaderProps): ReactNode {
  if (message === null) {
    const product = PRODUCTS[featureIndex % PRODUCTS.length]
    return <section className="reader reader--empty" aria-label="Reader">{product !== undefined && <ProductFeature product={product} theme={theme} />}</section>
  }

  return (
    <section className="reader" aria-label="Reader">
      <header className="reader__header">
        <h2>{message.subject}</h2>
        <dl className="reader__meta">
          <dt>From</dt>
          <dd>
            {message.fromName} <span className="reader__address">{message.from}</span>
          </dd>
          <dt>To</dt>
          <dd className="reader__address">{message.to}</dd>
          <dt>Received</dt>
          <dd>{formatFull(message.receivedAt)}</dd>
        </dl>
      </header>

      <p className="reader__route">
        <IconRoute aria-hidden="true" />
        <span>
          {message.matched === null ? (
            <>No rule claims {message.to}, so it waits in Unsorted.</>
          ) : (
            <>
              In <strong>{workspace?.name}</strong> because it was sent to <code>{message.matched}</code>
              {message.folderMatched !== null && (
                <>
                  , and in <strong>{message.folder}</strong> because it is from <code>{message.folderMatched}</code>
                </>
              )}
              .
            </>
          )}
        </span>
      </p>

      <div className="reader__body">
        <p>{message.preview}</p>
      </div>

      <footer className="reader__actions">
        <button type="button" className="reader__reply" disabled>
          <IconReply aria-hidden="true" />
          Reply as {message.to}
        </button>
        <span className="reader__soon">Sending arrives in the next step.</span>
      </footer>
    </section>
  )
}
