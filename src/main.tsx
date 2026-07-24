import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installExternalLinkHandler } from './lib/tauriHttp'
import './index.css'

// Desktop: open product/GitHub/explorer links in the system browser.
installExternalLinkHandler()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
