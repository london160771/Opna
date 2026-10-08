import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { getOwnerBusiness, type OwnerBusiness } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from './Brand';
import { Loading } from './Loading';
import { OwnerBusinessUpdaterContext } from './OwnerWorkspaceContext';

const navigation = [
  { to: '/app', label: 'Overview', end: true },
  { to: '/app/bookings', label: 'Bookings', end: false },
  { to: '/app/services', label: 'Services', end: false },
  { to: '/app/availability', label: 'Availability', end: false },
  { to: '/app/settings', label: 'Settings', end: false },
];

function NavigationLinks({
  business,
  onNavigate,
}: {
  business: OwnerBusiness | null;
  onNavigate?: () => void;
}) {
  return <>
    {navigation.filter((item) => business || item.to === '/app').map((item) => (
      <NavLink
        key={item.to}
        to={!business ? '/app/setup' : item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) => `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
      >
        {item.label}
      </NavLink>
    ))}
  </>;
}

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
  }, [attempt, session?.user.id]);

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
    <OwnerBusinessUpdaterContext.Provider value={setBusiness}>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-50">
        <header className="z-40 h-16 shrink-0 border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-6">
              <Brand />
              {business && <p className="hidden max-w-56 truncate border-s border-slate-200 ps-5 text-sm font-medium text-slate-700 sm:block">{business.name}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-3">
              <span className="hidden max-w-48 truncate text-sm text-slate-600 md:block">{session?.user.email}</span>
              <button
                type="button"
                aria-label={mobileNavigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileNavigationOpen}
                aria-controls="owner-mobile-navigation"
                onClick={() => setMobileNavigationOpen((open) => !open)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 lg:hidden"
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
        </header>

        <div className="relative flex min-h-0 flex-1">
          <aside className="hidden w-60 shrink-0 overflow-hidden border-e border-slate-200 bg-white p-4 lg:flex lg:flex-col">
            <nav aria-label="Owner navigation" className="flex flex-col gap-1 overflow-hidden">
              <NavigationLinks business={business} />
            </nav>
          </aside>

          {mobileNavigationOpen && <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavigationOpen(false)}
            className="fixed inset-x-0 bottom-0 top-16 z-20 bg-slate-950/30 lg:hidden"
          />}
          <aside
            id="owner-mobile-navigation"
            aria-label="Owner navigation"
            hidden={!mobileNavigationOpen}
            className="fixed inset-y-16 start-0 z-30 w-72 max-w-[85vw] overflow-hidden border-e border-slate-200 bg-white p-4 shadow-xl lg:hidden"
          >
            <nav className="flex flex-col gap-1 overflow-hidden">
              <NavigationLinks business={business} onNavigate={() => setMobileNavigationOpen(false)} />
            </nav>
          </aside>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
            <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
            {business && <footer className="mx-auto max-w-6xl px-5 pb-8 sm:px-8"><p className="text-xs text-slate-500">Booking link: <code className="font-mono">/book/{business.slug}</code> <Link to="/app/settings" className="ms-2 underline decoration-slate-300 underline-offset-4 hover:text-slate-700">Copy or manage</Link></p></footer>}
          </div>
        </div>
      </div>
    </OwnerBusinessUpdaterContext.Provider>
  );
}
