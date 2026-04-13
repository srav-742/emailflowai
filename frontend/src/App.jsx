import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import GmailConnect from './pages/GmailConnect';
import GmailCallback from './pages/GmailCallback';
import Dashboard from './pages/Dashboard';
import EmailList from './pages/EmailList';
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
