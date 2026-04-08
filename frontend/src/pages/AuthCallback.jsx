// This file is no longer needed since we're using Firebase auth directly
// The AuthCallback was for the old Google OAuth flow
// You can safely delete this file or keep it for reference

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to login since we're using Firebase auth now
    navigate('/login');
  }, [navigate]);

  return (
    <div className="auth-callback">
      <p>Redirecting to login...</p>
    </div>
  );
};

export default AuthCallback;
