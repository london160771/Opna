import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { safeReturnPath } from '../lib/paths';
import { Brand } from './Brand';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const { signIn, signUp, configured, session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnPath = safeReturnPath(searchParams.get('returnTo'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={returnPath} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (isRegister) {
        const hasSession = await signUp(email.trim().toLowerCase(), password);
        if (hasSession) {
          navigate(returnPath, { replace: true });
        } else {
          setNotice('Check your email to confirm your account, then sign in.');
        }
      } else {
        await signIn(email.trim().toLowerCase(), password);
        navigate(returnPath, { replace: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not complete that request. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 sm:px-8">
      <header><Brand /></header>
      <div className="flex flex-1 items-center justify-center py-12">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="auth-title">
          <p className="text-sm font-semibold text-blue-700">Owner account</p>
          <h1 id="auth-title" className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {isRegister ? 'Create your booking page' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {isRegister ? 'Start with an owner account. You can set up your business next.' : 'Sign in to continue to your owner workspace.'}
          </p>

          {!configured && <ConfigNotice />}
          {notice && <p className="mt-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-900" role="status">{notice}</p>}
          {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-800">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-800">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {isRegister && <p className="mt-1.5 text-sm text-slate-600">Use at least 8 characters.</p>}
            </div>
            <button
              type="submit"
              disabled={!configured || busy}
              className="min-h-12 w-full rounded-lg bg-blue-700 px-4 font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            {isRegister ? 'Already have an account?' : 'New to Opna?'}{' '}
            <Link className="font-semibold text-blue-700 underline-offset-4 hover:underline" to={isRegister ? '/login' : '/register'}>
              {isRegister ? 'Log in' : 'Create an account'}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

function ConfigNotice() {
  return (
    <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
      Supabase is not configured yet. Add the frontend Supabase URL and publishable key to `.env` to enable owner sign-in.
    </p>
  );
}
