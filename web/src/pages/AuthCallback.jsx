import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clearToken } from '../api/client';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    clearToken();

    const error = searchParams.get('error');
    if (error) {
      navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    // Exchange one-time callback state for the auth cookie on this origin.
    fetch('/api/auth/set-cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    })
      .then((response) => {
        if (!response.ok) throw new Error('auth_exchange_failed');
        // Force a full reload so auth context initializes with the new cookie.
        window.location.replace('/home');
      })
      .catch(() => navigate('/login?error=auth_failed', { replace: true }));
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-cad-bg flex items-center justify-center">
      <div className="text-cad-muted">Authenticating...</div>
    </div>
  );
}
