import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BillingProvider } from './context/BillingContext'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BillingProvider>
          <App />
        </BillingProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
