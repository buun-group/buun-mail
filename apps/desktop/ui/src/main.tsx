import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { isMac } from './api/window'

import '@buun-mail/brand/motion.css'
import './styles/base.css'

document.documentElement.dataset['platform'] = isMac ? 'mac' : 'other'

const root = document.getElementById('root')
if (root === null) throw new Error('index.html has no #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
