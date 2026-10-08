import { useEffect, useState, type FormEvent } from 'react';
import { createOwnerService, getOwnerServices, OwnerApiError, updateOwnerService, type OwnerService } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from '../components/Loading';
import { validateServiceInput } from '../lib/ownerValidation';

export function ServicesPage() {
  const { session } = useAuth();
  const [services, setServices] = useState<OwnerService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<OwnerService | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(30);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState('');

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    void getOwnerServices(session.access_token)
      .then((result) => { if (active) setServices(result); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : 'We could not load your services.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, session?.user.id]);

  function beginCreate() {
    setEditing(null); setName(''); setDuration(30); setErrors({}); setSaveError(''); setCreating(true);
  }
  function beginEdit(service: OwnerService) {
    setEditing(service); setName(service.name); setDuration(service.durationMinutes); setErrors({}); setSaveError(''); setCreating(true);
  }
  function closeForm() { setCreating(false); setEditing(null); setErrors({}); setSaveError(''); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateServiceInput(name, duration);
    setErrors(nextErrors); setSaveError('');
    if (Object.keys(nextErrors).length || !session) return;
    setSaving(true);
    try {
      const result = editing
        ? await updateOwnerService(session.access_token, editing.id, { name, durationMinutes: duration })
        : await createOwnerService(session.access_token, { name, durationMinutes: duration });
      setServices((current) => editing ? current.map((item) => item.id === result.id ? result : item) : [...current, result]);
      closeForm();
    } catch (error) {
      if (error instanceof OwnerApiError) { setErrors(error.fields); setSaveError(error.message); }
      else setSaveError('We could not save this service. Try again.');
    } finally { setSaving(false); }
  }

  async function toggleActive(service: OwnerService) {
    if (!session || changingId) return;
    setChangingId(service.id); setSaveError('');
    try {
      const updated = await updateOwnerService(session.access_token, service.id, { isActive: !service.isActive });
      setServices((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'We could not update this service. Try again.'); }
    finally { setChangingId(''); }
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-blue-700">Your offer</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Services</h1><p className="mt-2 max-w-2xl text-slate-600">Set what customers can book and how long each appointment takes.</p></div>
        {!loading && !loadError && <button type="button" onClick={beginCreate} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800">Add service</button>}
      </div>

      {creating && <form onSubmit={(event) => void submit(event)} noValidate className="mt-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Edit service' : 'Add a service'}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_220px]">
          <div><label htmlFor="service-name" className="block text-sm font-semibold text-slate-800">Service name</label><input id="service-name" value={name} maxLength={120} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, name: '' })); }} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'service-name-error' : undefined} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3" placeholder="e.g. Initial consultation" />{errors.name && <p id="service-name-error" className="mt-1 text-sm text-red-700">{errors.name}</p>}</div>
          <div><label htmlFor="service-duration" className="block text-sm font-semibold text-slate-800">Duration</label><select id="service-duration" value={duration} onChange={(event) => { setDuration(Number(event.target.value)); setErrors((current) => ({ ...current, durationMinutes: '' })); }} aria-invalid={Boolean(errors.durationMinutes)} aria-describedby={errors.durationMinutes ? 'service-duration-error' : undefined} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3">{Array.from({ length: 16 }, (_, index) => (index + 1) * 15).map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select>{errors.durationMinutes && <p id="service-duration-error" className="mt-1 text-sm text-red-700">{errors.durationMinutes}</p>}</div>
        </div>
        {saveError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
        <div className="mt-5 flex flex-wrap gap-3"><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{saving ? 'Saving…' : editing ? 'Save changes' : 'Save service'}</button><button type="button" onClick={closeForm} className="min-h-11 rounded-lg px-4 font-semibold text-slate-700 hover:bg-slate-100">Cancel</button></div>
      </form>}

      {loading ? <div className="mt-6 rounded-xl border border-slate-200 bg-white"><Loading label="Loading services" /></div>
        : loadError ? <div className="mt-6 rounded-xl border border-red-200 bg-white p-5"><p role="alert" className="text-sm text-red-800">{loadError}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">Try again</button></div>
          : <>
            {saveError && !creating && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
            {services.length === 0 && !creating ? <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="text-lg font-semibold text-slate-900">No services yet</h2><p className="mt-2 text-slate-600">Add the first service customers can book.</p><button type="button" onClick={beginCreate} className="mt-4 min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800">Add your first service</button></div> : null}
            {services.length > 0 && <div className="mt-6 space-y-3">{services.map((service) => <article key={service.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-semibold text-slate-900">{service.name}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${service.isActive ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{service.isActive ? 'Active' : 'Inactive'}</span></div><p className="mt-1 text-sm text-slate-600">{service.durationMinutes} minutes</p><p className="mt-2 text-xs text-slate-500">Existing bookings keep their saved service details.</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => beginEdit(service)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button><button type="button" disabled={changingId === service.id || Boolean(changingId)} onClick={() => void toggleActive(service)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">{changingId === service.id ? 'Saving…' : service.isActive ? 'Deactivate' : 'Activate'}</button></div></article>)}</div>}
          </>}
    </>
  );
}
