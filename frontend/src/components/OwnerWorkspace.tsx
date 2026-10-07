import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { getOwnerBusiness, type OwnerBusiness } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from './Brand';
import { Loading } from './Loading';

const navigation = [
  { to: '/app', label: 'Setup', end: true },
  { to: '/app/services', label: 'Services', end: false },
  { to: '/app/availability', label: 'Availability', end: false },
  { to: '/app/settings', label: 'Settings', end: false },
];

export function OwnerWorkspace({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();
  const [business, setBusiness] = useState<OwnerBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError('');
    void getOwnerBusiness(session.access_token)
      .then((result) => { if (active) setBusiness(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'We could not load your workspace.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, session?.access_token]);

  if (loading) return <Loading label="Opening your workspace" />;
  if (error) {
    return (
      <main className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-xl font-semibold text-slate-900">We couldn’t open your workspace</h1>
        <p className="mt-2 text-slate-600" role="alert">{error}</p>
        <button type="button" className="mt-5 min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-4 sm:gap-8">
            <Brand />
            {business && <p className="hidden max-w-48 truncate border-l border-slate-200 pl-5 text-sm font-medium text-slate-700 sm:block">{business.name}</p>}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-slate-600 md:block">{session?.user.email}</span>
            <button type="button" onClick={() => void signOut()} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Log out</button>
          </div>
          <nav aria-label="Owner navigation" className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:gap-1">
            {navigation.filter((item) => business || item.to === '/app').map((item) => (
              <NavLink
                key={item.to}
                to={!business ? '/app/setup' : item.to}
                end={item.end}
                className={({ isActive }) => `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
      {business && <footer className="mx-auto max-w-6xl px-5 pb-8 sm:px-8"><p className="text-xs text-slate-500">Booking link: <code className="font-mono">/book/{business.slug}</code> <Link to="/app/settings" className="ml-2 underline decoration-slate-300 underline-offset-4 hover:text-slate-700">Copy or manage</Link></p></footer>}
    </div>
  );
}
