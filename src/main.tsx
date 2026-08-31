import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { strings } from './strings'
import './styles/global.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error(strings.console.rootElementMissing)
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
