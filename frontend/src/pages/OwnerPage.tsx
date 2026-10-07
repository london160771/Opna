import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOwnerAvailability, getOwnerServices } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from '../components/Loading';
import { OwnerWorkspace } from '../components/OwnerWorkspace';

export function OwnerPage() {
  const { session } = useAuth();
  const [serviceCount, setServiceCount] = useState<number | null>(null);
  const [availabilityCount, setAvailabilityCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setServiceCount(null);
    setAvailabilityCount(null);
    setError('');
    void Promise.all([getOwnerServices(session.access_token), getOwnerAvailability(session.access_token)])
      .then(([services, availability]) => {
        if (active) {
          setServiceCount(services.length);
          setAvailabilityCount(availability.windows.length);
        }
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'We could not load setup progress.'); });
    return () => { active = false; };
  }, [attempt, session?.access_token]);

  return (
    <OwnerWorkspace>
      <div className="max-w-3xl">
        <p className="text-sm font-semibold text-blue-700">Business setup</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Your booking page starts here</h1>
        <p className="mt-3 max-w-2xl text-slate-600">Add the services you offer and choose when customers can book. You can update either at any time.</p>

        {serviceCount === null || availabilityCount === null ? (
          error ? <div className="mt-7 rounded-xl border border-red-200 bg-white p-5" role="alert"><p className="text-sm text-red-800">{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">Try again</button></div> : <div className="mt-7"><Loading label="Checking setup progress" /></div>
        ) : (
          <div className="mt-7 space-y-3">
            <SetupStep number="1" title="Add a service" description={serviceCount ? `${serviceCount} service${serviceCount === 1 ? '' : 's'} saved.` : 'Give customers a service to choose.'} complete={serviceCount > 0} to="/app/services" action={serviceCount ? 'Manage services' : 'Add a service'} />
            <SetupStep number="2" title="Set your weekly availability" description={availabilityCount ? `${availabilityCount} day${availabilityCount === 1 ? '' : 's'} open each week.` : 'Choose the days and hours you take bookings.'} complete={availabilityCount > 0} to="/app/availability" action={availabilityCount ? 'Edit availability' : 'Set availability'} />
          </div>
        )}
      </div>
    </OwnerWorkspace>
  );
}

function SetupStep({ number, title, description, complete, to, action }: { number: string; title: string; description: string; complete: boolean; to: string; action: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-4">
        <span aria-label={complete ? 'Complete' : `Step ${number}`} className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${complete ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{complete ? '✓' : number}</span>
        <div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>
      </div>
      <Link to={to} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">{action}</Link>
    </section>
  );
}
