import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to our backend
    this.logError(error, errorInfo);
  }

  logError = async (error, errorInfo) => {
    try {
      const errorData = {
        error_message: error.message || 'Unknown Error',
        error_stack: error.stack,
        component_name: this.props.name || 'Unknown Component',
        page_url: window.location.href,
        browser_info: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        }
      };

      await fetch('/api/errors/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(errorData)
      });
    } catch (logErr) {
      console.error('Failed to log error to server:', logErr);
    }
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      return (
        <div className="error-boundary-fallback">
          <div className="error-card">
            <div className="error-icon">⚠️</div>
            <h2>Something went wrong</h2>
            <p>We've encountered an unexpected error. Our team has been notified.</p>
            
            <div className="error-actions">
              <button onClick={this.handleRetry} className="retry-btn">
                Try Again
              </button>
              <button onClick={() => window.location.href = '/'} className="home-btn">
                Go to Dashboard
              </button>
            </div>
            
            {process.env.NODE_ENV === 'development' && (
              <details className="error-details">
                <summary>Technical Details</summary>
                <pre>{this.state.error?.toString()}</pre>
              </details>
            )}
          </div>

          <style jsx>{`
            .error-boundary-fallback {
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 2rem;
              min-height: 200px;
              width: 100%;
              height: 100%;
              background: var(--bg-dark);
            }
            .error-card {
              background: var(--panel-bg);
              border: 1px solid var(--border-color);
              border-radius: 12px;
              padding: 2.5rem;
              max-width: 450px;
              text-align: center;
              box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            }
            .error-icon {
              font-size: 3rem;
              margin-bottom: 1rem;
            }
            h2 {
              color: var(--text-primary);
              margin-bottom: 1rem;
            }
            p {
              color: var(--text-secondary);
              margin-bottom: 2rem;
              line-height: 1.5;
            }
            .error-actions {
              display: flex;
              gap: 1rem;
              justify-content: center;
            }
            .retry-btn {
              background: var(--accent-color);
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 8px;
              font-weight: 600;
              cursor: pointer;
              transition: opacity 0.2s;
            }
            .home-btn {
              background: transparent;
              color: var(--text-secondary);
              border: 1px solid var(--border-color);
              padding: 0.75rem 1.5rem;
              border-radius: 8px;
              font-weight: 600;
              cursor: pointer;
            }
            .error-details {
              margin-top: 2rem;
              text-align: left;
              font-size: 0.8rem;
              color: #ff5555;
            }
            pre {
              background: #1a1a1a;
              padding: 1rem;
              border-radius: 6px;
              overflow-x: auto;
              margin-top: 0.5rem;
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
