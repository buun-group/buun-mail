import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './i18n'
import { App } from './App'
import { hasOwnTitleBar, isMac, isPhone, watchMaximized } from './api/window'

import '@buun-mail/brand/motion.css'
import './styles/base.css'
import { followInputMode } from './lib/inputMode'

document.documentElement.dataset['platform'] = isMac ? 'mac' : 'other'
// The desktop window is transparent so the app can round its own corners; square again while maximised.
// A phone has no window: the app fills the screen, one pane at a time (styles/phone.css).
if (isPhone) document.documentElement.dataset['shell'] = 'phone'
else if (hasOwnTitleBar || isMac) document.documentElement.dataset['shell'] = 'desktop'
watchMaximized((maximized) => {
  document.documentElement.dataset['maximized'] = String(maximized)
})

const root = document.getElementById('root')
if (root === null) throw new Error('index.html has no #root')

followInputMode()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
