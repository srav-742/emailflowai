import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BillingProvider } from './context/BillingContext'
import { AccountProvider } from './context/AccountContext'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary name="RootApp">
      <BrowserRouter>
        <AuthProvider>
          <BillingProvider>
            <AccountProvider>
              <App />
            </AccountProvider>
          </BillingProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
