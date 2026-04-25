import React from 'react';

/**
 * ErrorBoundary
 * 
 * A high-fidelity, premium error boundary that catches UI crashes
 * and provides a graceful recovery path for the user.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[UI Crash Detected]:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-shell">
          <div className="error-boundary-card">
            <div className="error-icon-glow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h1>Something unexpected happened</h1>
            <p>
              EmailFlow AI encountered a UI crash. This is usually temporary and can be fixed by refreshing the application state.
            </p>
            <div className="error-actions">
              <button className="button button-primary" onClick={this.handleRetry}>
                Try again
              </button>
              <button className="button button-ghost" onClick={() => window.location.href = '/'}>
                Return home
              </button>
            </div>
            {import.meta.env.DEV && (
              <details className="error-details">
                <summary>Technical Details</summary>
                <pre>{this.state.error?.stack || this.state.error?.message}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
