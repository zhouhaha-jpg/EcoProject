import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { StrategyProvider } from './context/StrategyContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <StrategyProvider>
        <App />
      </StrategyProvider>
    </BrowserRouter>
  </React.StrictMode>
)
