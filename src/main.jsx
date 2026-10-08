import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import { ContaProvider } from './contexts/ContaContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ContaProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ContaProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
