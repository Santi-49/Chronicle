import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installRendererDiagnostics } from './lib/diagnostics'
import './styles/index.css'

installRendererDiagnostics()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
