import { useEffect, useState, type FormEvent } from 'react';
import { getOwnerAvailability, OwnerApiError, saveOwnerAvailability, type AvailabilityWindow } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from '../components/Loading';
import { OwnerWorkspace } from '../components/OwnerWorkspace';
import { validateAvailabilityWindows } from '../lib/ownerValidation';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type DaySetting = { open: boolean; startLocal: string; endLocal: string };
const closedWeek = (): DaySetting[] => weekdays.map(() => ({ open: false, startLocal: '09:00', endLocal: '17:00' }));

export function AvailabilityPage() {
  const { session } = useAuth();
  const [days, setDays] = useState<DaySetting[]>(closedWeek);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true); setLoadError('');
    void getOwnerAvailability(session.access_token)
      .then(({ windows }) => {
        if (!active) return;
        const nextDays = closedWeek();
        windows.forEach((window) => { nextDays[window.weekday] = { open: true, startLocal: window.startLocal, endLocal: window.endLocal }; });
        setDays(nextDays);
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : 'We could not load your availability.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, session?.access_token]);

  function updateDay(weekday: number, patch: Partial<DaySetting>) {
    setDays((current) => current.map((day, index) => index === weekday ? { ...day, ...patch } : day));
    setErrors({}); setSaveError(''); setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const windows: AvailabilityWindow[] = days.flatMap((day, weekday) => day.open ? [{ weekday, startLocal: day.startLocal, endLocal: day.endLocal }] : []);
    const nextErrors = validateAvailabilityWindows(windows);
    setErrors(nextErrors); setSaveError(''); setSaved(false);
    if (Object.keys(nextErrors).length || !session) return;
    setSaving(true);
    try {
      const result = await saveOwnerAvailability(session.access_token, windows);
      const nextDays = closedWeek();
      result.windows.forEach((window) => { nextDays[window.weekday] = { open: true, startLocal: window.startLocal, endLocal: window.endLocal }; });
      setDays(nextDays); setSaved(true);
    } catch (error) {
      if (error instanceof OwnerApiError) { setErrors(error.fields); setSaveError(error.message); }
      else setSaveError('We could not save your availability. Try again.');
    } finally { setSaving(false); }
  }

  return (
    <OwnerWorkspace>
      <div><p className="text-sm font-semibold text-blue-700">When you’re available</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Weekly availability</h1><p className="mt-2 max-w-2xl text-slate-600">Set one opening window for each day. Closed days will not offer booking times.</p></div>
      {loading ? <div className="mt-6 rounded-xl border border-slate-200 bg-white"><Loading label="Loading weekly availability" /></div>
        : loadError ? <div className="mt-6 rounded-xl border border-red-200 bg-white p-5"><p role="alert" className="text-sm text-red-800">{loadError}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">Try again</button></div>
          : <form onSubmit={(event) => void submit(event)} noValidate className="mt-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <p className="mb-4 text-sm text-slate-600">Times use your business time zone. Choose times in 15-minute intervals; overnight windows are not supported.</p>
            <div className="divide-y divide-slate-200">{days.map((day, weekday) => {
              const windowIndex = days.slice(0, weekday + 1).filter((item) => item.open).length - 1;
              const openingError = day.open ? errors[`windows.${windowIndex}.startLocal`] : undefined;
              const closingError = day.open ? errors[`windows.${windowIndex}.endLocal`] : undefined;
              return <fieldset key={weekdays[weekday]} className="grid gap-3 py-4 sm:grid-cols-[150px_120px_1fr] sm:items-center">
                <legend className="sr-only">{weekdays[weekday]} availability</legend>
                <span className="font-semibold text-slate-800">{weekdays[weekday]}</span>
                <label className="inline-flex min-h-11 items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={day.open} onChange={(event) => updateDay(weekday, { open: event.target.checked })} className="size-5 accent-blue-700" />Open</label>
                {day.open ? <div className="grid gap-3 sm:grid-cols-[minmax(120px,180px)_auto_minmax(120px,180px)] sm:items-center">
                  <div><label htmlFor={`start-${weekday}`} className="mb-1 block text-xs font-medium text-slate-600 sm:sr-only">{weekdays[weekday]} opens</label><input id={`start-${weekday}`} type="time" step={900} value={day.startLocal} onChange={(event) => updateDay(weekday, { startLocal: event.target.value })} aria-invalid={Boolean(openingError)} aria-describedby={openingError ? `start-error-${weekday}` : undefined} className="min-h-11 w-full rounded-lg border border-slate-300 px-3" />{openingError && <p id={`start-error-${weekday}`} className="mt-1 text-sm text-red-700">{openingError}</p>}</div>
                  <span className="hidden text-sm text-slate-500 sm:inline">to</span>
                  <div><label htmlFor={`end-${weekday}`} className="mb-1 block text-xs font-medium text-slate-600 sm:sr-only">{weekdays[weekday]} closes</label><input id={`end-${weekday}`} type="time" step={900} value={day.endLocal} onChange={(event) => updateDay(weekday, { endLocal: event.target.value })} aria-invalid={Boolean(closingError)} aria-describedby={closingError ? `end-error-${weekday}` : undefined} className="min-h-11 w-full rounded-lg border border-slate-300 px-3" />{closingError && <p id={`end-error-${weekday}`} className="mt-1 text-sm text-red-700">{closingError}</p>}</div>
                </div> : <span className="text-sm text-slate-500">Closed</span>}
              </fieldset>;
            })}</div>
            {saveError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
            {saved && <p role="status" aria-live="polite" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-900">Weekly availability saved.</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3"><button type="submit" disabled={saving} className="min-h-12 rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{saving ? 'Saving availability…' : 'Save availability'}</button><span className="text-sm text-slate-500">{days.filter((day) => day.open).length} of 7 days open</span></div>
          </form>}
    </OwnerWorkspace>
  );
}
