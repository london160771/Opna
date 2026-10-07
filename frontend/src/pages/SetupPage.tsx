import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOwnerBusiness, OwnerApiError } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { OwnerWorkspace } from '../components/OwnerWorkspace';
import { suggestBusinessSlug, validateBusinessInput } from '../lib/ownerValidation';

export function SetupPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateBusinessInput(name, slug, timezone);
    setErrors(nextErrors);
    setRequestError('');
    if (Object.keys(nextErrors).length || !session) return;

    setSaving(true);
    try {
      await createOwnerBusiness(session.access_token, { name, slug, timezone });
      navigate('/app', { replace: true });
    } catch (error) {
      if (error instanceof OwnerApiError) {
        setErrors(error.fields);
        setRequestError(error.message);
      } else setRequestError('We could not save your business. Try again.');
    } finally { setSaving(false); }
  }

  return (
    <OwnerWorkspace>
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold text-blue-700">First step</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Set up your business</h1>
        <p className="mt-3 text-slate-600">Add the details customers will see on your booking page. Your booking link is permanent once created.</p>
        <form onSubmit={(event) => void submit(event)} noValidate className="mt-7 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div>
            <label htmlFor="business-name" className="block text-sm font-semibold text-slate-800">Business name</label>
            <input id="business-name" value={name} maxLength={120} onChange={(event) => {
              const nextName = event.target.value;
              setName(nextName);
              if (!slugEdited) setSlug(suggestBusinessSlug(nextName));
              setErrors((current) => ({ ...current, name: '' }));
            }} autoComplete="organization" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'business-name-error' : 'business-name-hint'} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400" placeholder="e.g. Northside Studio" />
            <p id={errors.name ? 'business-name-error' : 'business-name-hint'} className={`mt-1 text-sm ${errors.name ? 'text-red-700' : 'text-slate-500'}`}>{errors.name || 'Use the name customers know you by.'}</p>
          </div>
          <div>
            <label htmlFor="business-slug" className="block text-sm font-semibold text-slate-800">Booking link</label>
            <div className="mt-2 flex min-h-12 items-center rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-blue-300">
              <span className="shrink-0 pl-3 text-sm text-slate-500">/book/</span>
              <input id="business-slug" value={slug} maxLength={100} onChange={(event) => { setSlug(suggestBusinessSlug(event.target.value)); setSlugEdited(true); setErrors((current) => ({ ...current, slug: '' })); }} aria-invalid={Boolean(errors.slug)} aria-describedby={errors.slug ? 'business-slug-error' : 'business-slug-hint'} className="min-w-0 flex-1 border-0 bg-transparent px-1 pr-3 text-base text-slate-900 outline-none" placeholder="northside-studio" />
            </div>
            <p id={errors.slug ? 'business-slug-error' : 'business-slug-hint'} className={`mt-1 text-sm ${errors.slug ? 'text-red-700' : 'text-slate-500'}`}>{errors.slug || 'Lowercase letters, numbers, and hyphens. This link cannot be changed later.'}</p>
          </div>
          <div>
            <label htmlFor="business-timezone" className="block text-sm font-semibold text-slate-800">Business time zone</label>
            <input id="business-timezone" value={timezone} onChange={(event) => { setTimezone(event.target.value); setErrors((current) => ({ ...current, timezone: '' })); }} autoComplete="off" aria-invalid={Boolean(errors.timezone)} aria-describedby={errors.timezone ? 'business-timezone-error' : 'business-timezone-hint'} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900" placeholder="Europe/London" />
            <p id={errors.timezone ? 'business-timezone-error' : 'business-timezone-hint'} className={`mt-1 text-sm ${errors.timezone ? 'text-red-700' : 'text-slate-500'}`}>{errors.timezone || 'Use an IANA time zone, such as Europe/London.'}</p>
          </div>
          {requestError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{requestError}</p>}
          <button type="submit" disabled={saving} className="min-h-12 w-full rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving business…' : 'Save business details'}</button>
        </form>
      </div>
    </OwnerWorkspace>
  );
}
