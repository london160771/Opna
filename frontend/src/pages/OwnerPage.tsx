import { useAuth } from '../auth/AuthProvider';
import { Brand } from '../components/Brand';

export function OwnerPage() {
  const { session, signOut } = useAuth();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <Brand />
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-600 sm:inline">{session?.user.email}</span>
          <button type="button" onClick={() => void signOut()} className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-white">Log out</button>
        </div>
      </header>
      <section className="py-10">
        <p className="text-sm font-semibold text-blue-700">Owner workspace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Your account is connected.</h1>
        <p className="mt-3 max-w-2xl text-slate-600">This protected route confirms the owner session and business lookup. Dashboard, services, and availability features are part of later phases.</p>
      </section>
    </main>
  );
}
