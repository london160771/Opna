import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from '../components/Brand';

export function SetupPage() {
  const { session, signOut } = useAuth();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <Brand />
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-white"
        >
          Log out
        </button>
      </header>
      <section className="mx-auto mt-16 max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:mt-24 sm:p-8" aria-labelledby="setup-title">
        <p className="text-sm font-semibold text-blue-700">Your owner account is ready</p>
        <h1 id="setup-title" className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Set up your business</h1>
        <p className="mt-3 text-slate-600">You’re signed in as <span className="font-medium text-slate-800">{session?.user.email}</span>.</p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-medium text-slate-900">Business setup is the next step.</p>
          <p className="mt-1 text-sm text-slate-600">This Phase 0 foundation protects your account and saves your session. Business details, services, and availability are not part of this phase.</p>
        </div>
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">Back to home</Link>
      </section>
    </main>
  );
}
