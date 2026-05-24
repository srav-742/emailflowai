import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import SignIn from './pages/SignIn';
import GmailCallback from './pages/GmailCallback';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import EmailList from './pages/EmailList';
import PricingPage from './pages/PricingPage';
import AnalyticsPage from './pages/AnalyticsPage';
import CalendarPage from './pages/CalendarPage';
import SemanticSearchPage from './pages/SemanticSearchPage';
import MemoryGraphPage from './pages/MemoryGraphPage';
import AgentWorkflowsPage from './pages/AgentWorkflowsPage';
import DigestSettings from './pages/Settings/DigestSettings';
import AccountSettings from './pages/Settings/AccountSettings';
import AutomationPage from './pages/AutomationPage';
import DocumentIntelligencePage from './pages/DocumentIntelligencePage';
import OmnichannelPage from './pages/OmnichannelPage';
import CampaignsPage from './pages/CampaignsPage';
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
  return token ? children : <Navigate to="/signin" replace />;
};

const PublicRoute = ({ children }) => {
  const { token, loading } = useAuth();
  if (loading) return <LoadingScreen message="Preparing your workspace..." />;
  return token ? <Navigate to="/dashboard" replace /> : children;
};

const HomeRoute = () => {
  const { token, loading } = useAuth();
  if (loading) return <LoadingScreen message="Preparing your workspace..." />;
  return token ? <Navigate to="/dashboard" replace /> : <SignIn />;
};

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route
          path="/signin"
          element={
            <PublicRoute>
              <SignIn />
            </PublicRoute>
          }
        />
        <Route path="/login" element={<Navigate to="/signin" replace />} />
        <Route
          path="/auth/gmail-connect"
          element={
            <ProtectedRoute>
              <Navigate to="/settings/accounts" replace />
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
          <Route path="newsletter" element={<Navigate to="/newsletters" replace />} />
          <Route path="social" element={<ErrorBoundary name="Social"><EmailList title="Social and community" description="Community updates, forums, and social notifications." filter={{ category: 'social' }} /></ErrorBoundary>} />
          
          {/* Smart Inbox Tabs */}
          <Route path="focus" element={<ErrorBoundary name="FocusToday"><EmailList title="Focus Today" description="High-priority emails that need your immediate attention." filter={{ priority: 'high', actionRequired: true }} /></ErrorBoundary>} />
          <Route path="read-later" element={<ErrorBoundary name="ReadLater"><EmailList title="Read Later" description="Interesting content saved for when you have more time." filter={{ categoryIn: ['newsletter', 'social'], priority: 'low' }} /></ErrorBoundary>} />
          <Route path="newsletters" element={<ErrorBoundary name="Newsletters"><EmailList title="Newsletters" description="Latest updates from your favorite publications." filter={{ category: 'newsletter' }} /></ErrorBoundary>} />
          <Route path="waiting" element={<ErrorBoundary name="WaitingReply"><EmailList title="Waiting for Reply" description="Emails where you are expecting a response." filter={{ followUp: true }} /></ErrorBoundary>} />
          <Route path="calendar" element={<ErrorBoundary name="Calendar"><CalendarPage /></ErrorBoundary>} />
          <Route path="analytics" element={<ErrorBoundary name="Analytics"><AnalyticsPage /></ErrorBoundary>} />
          <Route path="search" element={<ErrorBoundary name="SemanticSearch"><SemanticSearchPage /></ErrorBoundary>} />
          <Route path="memory" element={<ErrorBoundary name="MemoryGraph"><MemoryGraphPage /></ErrorBoundary>} />
          <Route path="workflows" element={<ErrorBoundary name="AgentWorkflows"><AgentWorkflowsPage /></ErrorBoundary>} />
          <Route path="automation" element={<ErrorBoundary name="Automation"><AutomationPage /></ErrorBoundary>} />
          <Route path="documents" element={<ErrorBoundary name="DocumentIntelligence"><DocumentIntelligencePage /></ErrorBoundary>} />
          <Route path="omnichannel" element={<ErrorBoundary name="Omnichannel"><OmnichannelPage /></ErrorBoundary>} />
          <Route path="campaigns" element={<ErrorBoundary name="Campaigns"><CampaignsPage /></ErrorBoundary>} />

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
