import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { getOwnerBusiness, type OwnerBusiness } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from './Brand';
import { Loading } from './Loading';

const navigation = [
  { to: '/app', label: 'Overview', end: true },
  { to: '/app/bookings', label: 'Bookings', end: false },
  { to: '/app/services', label: 'Services', end: false },
  { to: '/app/availability', label: 'Availability', end: false },
  { to: '/app/settings', label: 'Settings', end: false },
];

export function OwnerWorkspace({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const [business, setBusiness] = useState<OwnerBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => setMobileNavigationOpen(false), [location.pathname]);

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
        <div className="mx-auto max-w-6xl px-5 py-3 sm:px-8 sm:py-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3 sm:gap-8">
              <Brand />
              {business && <p className="hidden max-w-48 truncate border-l border-slate-200 pl-5 text-sm font-medium text-slate-700 sm:block">{business.name}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-3">
              <span className="hidden max-w-48 truncate text-sm text-slate-600 md:block">{session?.user.email}</span>
              <button
                type="button"
                aria-label={mobileNavigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileNavigationOpen}
                aria-controls="owner-navigation"
                onClick={() => setMobileNavigationOpen((open) => !open)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:hidden"
              >
                <span aria-hidden="true" className="grid gap-1">
                  <span className="h-0.5 w-5 rounded-full bg-current" />
                  <span className="h-0.5 w-5 rounded-full bg-current" />
                  <span className="h-0.5 w-5 rounded-full bg-current" />
                </span>
              </button>
              <button type="button" onClick={() => void signOut()} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Log out</button>
            </div>
          </div>
          <nav
            id="owner-navigation"
            aria-label="Owner navigation"
            className={`${mobileNavigationOpen ? 'flex' : 'hidden'} mt-3 w-full flex-col gap-1 border-t border-slate-100 pt-3 sm:mt-0 sm:flex sm:w-auto sm:flex-row sm:border-0 sm:pt-0`}
          >
            {navigation.filter((item) => business || item.to === '/app').map((item) => (
              <NavLink
                key={item.to}
                to={!business ? '/app/setup' : item.to}
                end={item.end}
                onClick={() => setMobileNavigationOpen(false)}
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
