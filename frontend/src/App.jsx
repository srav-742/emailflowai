import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import GmailConnect from './pages/GmailConnect';
import GmailCallback from './pages/GmailCallback';
import Dashboard from './pages/Dashboard';
import EmailList from './pages/EmailList';
import PricingPage from './pages/PricingPage';
import AnalyticsPage from './pages/AnalyticsPage';
import CalendarPage from './pages/CalendarPage';
import DigestSettings from './pages/Settings/DigestSettings';
import ErrorBoundary from './components/ErrorBoundary';
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
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="emails" element={<EmailList title="Inbox command center" description="Search, sort, and process your full email stream." />} />
          <Route path="finance" element={<EmailList title="Finance queue" description="Invoices, receipts, budgets, and payment approvals." filter={{ category: 'finance' }} />} />
          <Route path="developer" element={<EmailList title="Developer queue" description="Deployments, pull requests, outages, and engineering updates." filter={{ category: 'developer' }} />} />
          <Route path="meetings" element={<EmailList title="Meetings and calendar" description="Invites, agendas, scheduling, and follow-ups." filter={{ category: 'meetings' }} />} />
          <Route path="newsletter" element={<EmailList title="Newsletters and promos" description="Low-noise reads that can wait until later." filter={{ category: 'newsletter' }} />} />
          <Route path="social" element={<EmailList title="Social and community" description="Community updates, forums, and social notifications." filter={{ category: 'social' }} />} />
          
          {/* Smart Inbox Tabs */}
          <Route path="focus" element={<EmailList title="Focus Today" description="High-priority emails that need your immediate attention." filter={{ priority: 'high', actionRequired: true }} />} />
          <Route path="read-later" element={<EmailList title="Read Later" description="Interesting content saved for when you have more time." filter={{ categoryIn: ['newsletter', 'social'], priority: 'low' }} />} />
          <Route path="newsletters" element={<EmailList title="Newsletters" description="Latest updates from your favorite publications." filter={{ category: 'newsletter' }} />} />
          <Route path="waiting" element={<EmailList title="Waiting for Reply" description="Emails where you are expecting a response." filter={{ followUp: true }} />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings/digest" element={<DigestSettings />} />
          <Route path="pricing" element={<PricingPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
