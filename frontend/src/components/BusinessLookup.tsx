import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PublicApiError, searchPublicBusinesses } from '../api/public';

export function BusinessLookup() {
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [results, setResults] = useState<{ name: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    setError('');
    setHint('');
    if (value.length < 2) {
      setResults([]);
      setSearchedQuery('');
      setHint('Enter at least two characters to search.');
      return;
    }
    if (value.length > 100) {
      setResults([]);
      setSearchedQuery('');
      setHint('Use 100 characters or fewer.');
      return;
    }
    setSearchedQuery(value);
    setLoading(true);
    try {
      setResults(await searchPublicBusinesses(value));
    } catch (cause) {
      setResults([]);
      setError(cause instanceof PublicApiError ? cause.message : 'We could not search right now. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="find-business" className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:mt-14 sm:p-7" aria-labelledby="find-business-heading">
      <div className="max-w-2xl"><p className="text-sm font-semibold text-blue-700">Already know the business?</p><h2 id="find-business-heading" className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Find a business</h2><p className="mt-2 text-sm text-slate-600">Search by business name or booking link. This search only shows matching businesses.</p></div>
      <form onSubmit={(event) => void submit(event)} className="mt-5 flex flex-col gap-3 sm:max-w-2xl sm:flex-row">
        <div className="flex-1"><label htmlFor="business-search" className="sr-only">Business name or booking link</label><input id="business-search" type="search" value={query} disabled={loading} onChange={(event) => { setQuery(event.target.value); setResults([]); setSearchedQuery(''); setHint(''); setError(''); }} maxLength={100} placeholder="e.g. Northside Studio" className="min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100" /></div>
        <button type="submit" disabled={loading} className="min-h-12 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">{loading ? 'Searching…' : 'Search'}</button>
      </form>
      {hint && <p className="mt-3 text-sm text-slate-600" role="status">{hint}</p>}
      {error && <p className="mt-3 text-sm text-red-800" role="alert">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-600" role="status">Searching for businesses…</p>}
      {!loading && searchedQuery && !error && results.length === 0 && <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700" role="status">No businesses matched “{searchedQuery}”. Check the spelling or open the direct link from the business.</p>}
      {!loading && results.length > 0 && <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Matching businesses">{results.map((business) => <li key={business.slug}><Link to={`/book/${business.slug}`} className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 font-medium text-slate-900 hover:border-blue-400 hover:bg-blue-50"><span className="break-words">{business.name}</span><span className="shrink-0 text-sm font-semibold text-blue-700">Book</span></Link></li>)}</ul>}
    </section>
  );
}
