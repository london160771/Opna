import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { getOwnerBusiness } from '../api/owner';
import { Loading } from './Loading';

export function OwnerGuard({ children, setupPage = false }: { children: ReactNode; setupPage?: boolean }) {
  const { session, loading, signOut } = useAuth();
  const location = useLocation();
  const [businessState, setBusinessState] = useState<'checking' | 'ready' | 'missing' | 'error'>('checking');
  const [checkedOwnerId, setCheckedOwnerId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (loading || !session) return;
    let active = true;
    setBusinessState('checking');
    void getOwnerBusiness(session.access_token)
      .then((business) => {
        if (active) {
          setCheckedOwnerId(session.user.id);
          setBusinessState(business ? 'ready' : 'missing');
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCheckedOwnerId(session.user.id);
        const message = error instanceof Error ? error.message : 'We could not check your business setup.';
        setErrorMessage(message);
        if (message.includes('session has expired')) {
          void signOut().catch(() => setBusinessState('error'));
          return;
        }
        setBusinessState('error');
      });
    return () => { active = false; };
  }, [attempt, loading, session?.user.id, signOut]);

  if (loading) return <Loading label="Checking your session" />;
  if (!session) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  const currentBusinessState = checkedOwnerId === session.user.id ? businessState : 'checking';
  if (currentBusinessState === 'checking') return <Loading label="Checking your business setup" />;
  if (currentBusinessState === 'missing') return setupPage ? <>{children}</> : <Navigate to="/app/setup" replace />;
  if (currentBusinessState === 'ready' && setupPage) return <Navigate to="/app" replace />;
  if (currentBusinessState === 'error') {
    return (
      <main className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-xl font-semibold text-slate-900">We couldn’t open your workspace</h1>
        <p className="mt-2 text-slate-600" role="alert">{errorMessage}</p>
        <button
          type="button"
          className="mt-5 min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Try again
        </button>
      </main>
    );
  }
  return <>{children}</>;
}
