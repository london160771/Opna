import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';

export function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <Link to="/login" className="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-slate-700 hover:bg-white hover:text-slate-900">Login</Link>
      </header>
      <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:pb-24">
        <section>
          <p className="text-sm font-semibold text-blue-700">Booking, made simple</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">A simple booking page for your business.</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">Set your services and hours, share one clear link, and keep your appointments in one place.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/register" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-blue-700 px-5 font-semibold text-white transition-colors hover:bg-blue-800">Create your booking page</Link>
            <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 font-semibold text-slate-800 hover:bg-slate-100">Login</Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Step number="01" title="Add your services" />
            <Step number="02" title="Set your hours" />
            <Step number="03" title="Share your link" />
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Example booking page preview">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <p className="text-sm font-medium text-slate-500">Booking page preview</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">Your business</p>
              <p className="mt-1 text-sm text-slate-600">Choose a service to get started</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">Preview</span>
          </div>
          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-900">Select a service</span>
              <span className="text-sm text-slate-500">Step 1 of 3</span>
            </div>
            <div className="mt-4 rounded-lg border border-blue-700 bg-blue-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900">Your service</span>
                <span className="text-sm text-slate-600">30 min</span>
              </div>
            </div>
            <div className="mt-3 min-h-11 rounded-lg bg-blue-700 px-4 py-2.5 text-center text-sm font-semibold text-white">Continue</div>
          </div>
          <p className="mt-4 text-sm text-slate-500">A clear path for clients to book with you.</p>
        </aside>
      </main>
    </div>
  );
}

function Step({ number, title }: { number: string; title: string }) {
  return (
    <div className="border-t border-slate-200 pt-3">
      <p className="text-xs font-semibold tracking-wide text-blue-700">{number}</p>
      <p className="mt-1 text-sm font-medium text-slate-800">{title}</p>
    </div>
  );
}
