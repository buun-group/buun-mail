import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './i18n'
import { App } from './App'
import { hasOwnTitleBar, isMac, watchMaximized } from './api/window'

import '@buun-mail/brand/motion.css'
import './styles/base.css'

document.documentElement.dataset['platform'] = isMac ? 'mac' : 'other'
// The desktop window is transparent so the app can round its own corners; square again while maximised.
if (hasOwnTitleBar || isMac) document.documentElement.dataset['shell'] = 'desktop'
watchMaximized((maximized) => {
  document.documentElement.dataset['maximized'] = String(maximized)
})

const root = document.getElementById('root')
if (root === null) throw new Error('index.html has no #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
