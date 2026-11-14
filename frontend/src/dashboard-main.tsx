import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Dashboard from './Dashboard'
import { syncMissionFromUrl } from './lib/mission'
import { registerServiceWorker } from './lib/registerSw'
import './index.css'

syncMissionFromUrl()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(<StrictMode><Dashboard/></StrictMode>)
