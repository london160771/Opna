import { useEffect, useState, type FormEvent } from 'react';
import { getOwnerBusiness, OwnerApiError, updateOwnerBusiness, type OwnerBusiness } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from '../components/Loading';
import { OwnerWorkspace } from '../components/OwnerWorkspace';
import { validateBusinessInput } from '../lib/ownerValidation';

export function SettingsPage() {
  const { session } = useAuth();
  const [business, setBusiness] = useState<OwnerBusiness | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true); setLoadError('');
    void getOwnerBusiness(session.access_token)
      .then((result) => {
        if (!active || !result) return;
        setBusiness(result); setName(result.name); setTimezone(result.timezone);
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : 'We could not load your business settings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, session?.access_token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateBusinessInput(name, business?.slug ?? '', timezone);
    delete nextErrors.slug;
    setErrors(nextErrors); setSaveError(''); setSaved(false);
    if (Object.keys(nextErrors).length || !session) return;
    setSaving(true);
    try {
      const result = await updateOwnerBusiness(session.access_token, { name, ...(!business?.hasBookings ? { timezone } : {}) });
      setBusiness(result); setName(result.name); setTimezone(result.timezone); setSaved(true);
    } catch (error) {
      if (error instanceof OwnerApiError) { setErrors(error.fields); setSaveError(error.message); }
      else setSaveError('We could not save your business settings. Try again.');
    } finally { setSaving(false); }
  }

  async function copyLink() {
    if (!business) return;
    const url = `${window.location.origin}/book/${business.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch { setSaveError('Your browser could not copy the link. Select and copy it instead.'); }
  }

  return (
    <OwnerWorkspace>
      <div><p className="text-sm font-semibold text-blue-700">Business profile</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Settings</h1><p className="mt-2 max-w-2xl text-slate-600">Keep your business details and booking link up to date.</p></div>
      {loading ? <div className="mt-6 rounded-xl border border-slate-200 bg-white"><Loading label="Loading business settings" /></div>
        : loadError ? <div className="mt-6 rounded-xl border border-red-200 bg-white p-5"><p role="alert" className="text-sm text-red-800">{loadError}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">Try again</button></div>
          : business && <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
            <form onSubmit={(event) => void submit(event)} noValidate className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">Business details</h2>
              <div className="mt-5"><label htmlFor="settings-name" className="block text-sm font-semibold text-slate-800">Business name</label><input id="settings-name" value={name} maxLength={120} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, name: '' })); setSaved(false); }} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'settings-name-error' : undefined} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3" />{errors.name && <p id="settings-name-error" className="mt-1 text-sm text-red-700">{errors.name}</p>}</div>
              <div className="mt-5"><label htmlFor="settings-timezone" className="block text-sm font-semibold text-slate-800">Business time zone</label><input id="settings-timezone" value={timezone} disabled={business.hasBookings} onChange={(event) => { setTimezone(event.target.value); setErrors((current) => ({ ...current, timezone: '' })); setSaved(false); }} aria-invalid={Boolean(errors.timezone)} aria-describedby={errors.timezone ? 'settings-timezone-error' : 'settings-timezone-hint'} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 disabled:bg-slate-100 disabled:text-slate-600" />{errors.timezone && <p id="settings-timezone-error" className="mt-1 text-sm text-red-700">{errors.timezone}</p>}{!errors.timezone && <p id="settings-timezone-hint" className="mt-1 text-sm text-slate-500">{business.hasBookings ? 'Locked after your first booking to preserve appointment history.' : 'Use an IANA time zone, such as Europe/London.'}</p>}</div>
              {saveError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}{saved && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Business details saved.</p>}
              <button type="submit" disabled={saving} className="mt-5 min-h-12 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{saving ? 'Saving…' : 'Save changes'}</button>
            </form>
            <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="booking-link-heading"><h2 id="booking-link-heading" className="text-lg font-semibold text-slate-900">Permanent booking link</h2><p className="mt-2 text-sm text-slate-600">Your link slug stays the same so existing links remain stable.</p><label htmlFor="booking-link" className="mt-5 block text-sm font-semibold text-slate-800">Booking URL</label><input id="booking-link" readOnly value={`${window.location.origin}/book/${business.slug}`} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700" /><button type="button" onClick={() => void copyLink()} className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 px-4 font-semibold text-slate-800 hover:bg-slate-50">{copied ? 'Link copied' : 'Copy booking link'}</button></section>
          </div>}
    </OwnerWorkspace>
  );
}
