import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-24 text-center">
      <p className="text-sm font-semibold text-blue-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-600">That page isn’t available.</p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800">Go home</Link>
    </main>
  );
}
