import { useState } from 'react'
import type { ReactNode } from 'react'

import type { Place } from './api/types'

import { MessageList } from './components/MessageList/MessageList'
import { Reader } from './components/Reader/Reader'
import { Sidebar } from './components/Sidebar/Sidebar'
import { PRODUCTS } from './constants/products'
import { useMailbox } from './hooks/useMailbox'
import { useTheme } from './hooks/useTheme'

import './styles/app.css'

/** Three panes: workspaces, the open folder, the open message. */
export function App(): ReactNode {
  const { theme, toggle } = useTheme()
  const mailbox = useMailbox()
  const workspace = mailbox.workspaces.find((item) => item.id === mailbox.place?.workspace)
  // A different product fills the empty reader each time a folder opens, starting at a random one.
  const [featureIndex, setFeatureIndex] = useState(() => Math.floor(Math.random() * PRODUCTS.length))
  const open = (place: Place): void => {
    setFeatureIndex((index) => index + 1)
    mailbox.open(place)
  }

  if (mailbox.error !== null) {
    return (
      <p role="alert" className="app-error">
        The mailbox could not load: {mailbox.error}
      </p>
    )
  }

  return (
    <div className="app">
      <Sidebar workspaces={mailbox.workspaces} place={mailbox.place} theme={theme} onOpen={open} onToggleTheme={toggle} />
      <MessageList workspace={workspace} place={mailbox.place} messages={mailbox.messages} selectedId={mailbox.selected?.id ?? null} onSelect={mailbox.select} />
      <Reader message={mailbox.selected} workspace={workspace} theme={theme} featureIndex={featureIndex} />
    </div>
  )
}
