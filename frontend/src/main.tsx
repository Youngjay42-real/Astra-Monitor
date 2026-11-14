import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './home.css'
import './rocket-launch'
import App from './App.tsx'
import { registerServiceWorker } from './lib/registerSw'

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
