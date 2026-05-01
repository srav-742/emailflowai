import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import GmailConnect from './pages/GmailConnect';
import GmailCallback from './pages/GmailCallback';
import Dashboard from './pages/Dashboard';
import EmailList from './pages/EmailList';
import PricingPage from './pages/PricingPage';
import AnalyticsPage from './pages/AnalyticsPage';
import CalendarPage from './pages/CalendarPage';
import DigestSettings from './pages/Settings/DigestSettings';
import AccountSettings from './pages/Settings/AccountSettings';
import './index.css';

const LoadingScreen = ({ message = 'Loading EmailFlow AI...' }) => (
  <div className="app-loading-shell">
    <div className="app-loading-card">
      <div className="app-loading-spinner"></div>
      <p>{message}</p>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { token, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return token ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { token, loading } = useAuth();
  if (loading) return <LoadingScreen message="Preparing your workspace..." />;
  return token ? <Navigate to="/dashboard" replace /> : children;
};

const HomeRoute = () => {
  const { token, loading } = useAuth();
  if (loading) return <LoadingScreen message="Preparing your workspace..." />;
  return token ? <Navigate to="/dashboard" replace /> : <Login />;
};

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/auth/gmail-connect"
          element={
            <ProtectedRoute>
              <GmailConnect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auth/gmail-callback"
          element={
            <ProtectedRoute>
              <GmailCallback />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<ErrorBoundary name="Dashboard"><Dashboard /></ErrorBoundary>} />
          <Route path="emails" element={<ErrorBoundary name="Inbox"><EmailList title="Inbox command center" description="Search, sort, and process your full email stream." /></ErrorBoundary>} />
          <Route path="finance" element={<ErrorBoundary name="Finance"><EmailList title="Finance queue" description="Invoices, receipts, budgets, and payment approvals." filter={{ category: 'finance' }} /></ErrorBoundary>} />
          <Route path="developer" element={<ErrorBoundary name="Developer"><EmailList title="Developer queue" description="Deployments, pull requests, outages, and engineering updates." filter={{ category: 'developer' }} /></ErrorBoundary>} />
          <Route path="meetings" element={<ErrorBoundary name="Meetings"><CalendarPage /></ErrorBoundary>} />
          <Route path="newsletter" element={<ErrorBoundary name="Newsletter"><EmailList title="Newsletters and promos" description="Low-noise reads that can wait until later." filter={{ category: 'newsletter' }} /></ErrorBoundary>} />
          <Route path="social" element={<ErrorBoundary name="Social"><EmailList title="Social and community" description="Community updates, forums, and social notifications." filter={{ category: 'social' }} /></ErrorBoundary>} />
          
          {/* Smart Inbox Tabs */}
          <Route path="focus" element={<ErrorBoundary name="FocusToday"><EmailList title="Focus Today" description="High-priority emails that need your immediate attention." filter={{ priority: 'high', actionRequired: true }} /></ErrorBoundary>} />
          <Route path="read-later" element={<ErrorBoundary name="ReadLater"><EmailList title="Read Later" description="Interesting content saved for when you have more time." filter={{ categoryIn: ['newsletter', 'social'], priority: 'low' }} /></ErrorBoundary>} />
          <Route path="newsletters" element={<ErrorBoundary name="Newsletters"><EmailList title="Newsletters" description="Latest updates from your favorite publications." filter={{ category: 'newsletter' }} /></ErrorBoundary>} />
          <Route path="waiting" element={<ErrorBoundary name="WaitingReply"><EmailList title="Waiting for Reply" description="Emails where you are expecting a response." filter={{ followUp: true }} /></ErrorBoundary>} />
          <Route path="calendar" element={<ErrorBoundary name="Calendar"><CalendarPage /></ErrorBoundary>} />
          <Route path="analytics" element={<ErrorBoundary name="Analytics"><AnalyticsPage /></ErrorBoundary>} />
          <Route path="settings/digest" element={<ErrorBoundary name="DigestSettings"><DigestSettings /></ErrorBoundary>} />
          <Route path="settings/accounts" element={<ErrorBoundary name="AccountSettings"><AccountSettings /></ErrorBoundary>} />
          <Route path="pricing" element={<ErrorBoundary name="Pricing"><PricingPage /></ErrorBoundary>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
