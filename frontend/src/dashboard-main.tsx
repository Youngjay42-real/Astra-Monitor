import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Dashboard from './Dashboard'
import { syncMissionFromUrl } from './lib/mission'
import { registerServiceWorker } from './lib/registerSw'
/* Match homepage palette / type (home.css), then console layout. */
import './home.css'
import './styles/tokens.css'
import './styles/dashboard.css'

syncMissionFromUrl()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(<StrictMode><Dashboard/></StrictMode>)
