import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOwnerAvailability, getOwnerBusiness, getOwnerDashboard, getOwnerServices, type OwnerBusiness, type OwnerDashboard } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from '../components/Loading';
import { OwnerWorkspace } from '../components/OwnerWorkspace';
import { formatBookingDateTime } from '../lib/bookingFormat';

type OverviewData = {
  business: OwnerBusiness;
  dashboard: OwnerDashboard;
  serviceCount: number;
  availabilityCount: number;
};

export function OwnerPage() {
  const { session } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError('');
    void Promise.all([
      getOwnerBusiness(session.access_token),
      getOwnerDashboard(session.access_token),
      getOwnerServices(session.access_token),
      getOwnerAvailability(session.access_token),
    ]).then(([business, dashboard, services, availability]) => {
      if (!active) return;
      if (!business) {
        setError('Your business setup is not available yet. Complete setup to open the dashboard.');
        return;
      }
      setData({ business, dashboard, serviceCount: services.filter((service) => service.isActive).length, availabilityCount: availability.windows.length });
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'We could not load your dashboard.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, session?.access_token]);

  async function copyBookingLink() {
    if (!data) return;
    const url = `${window.location.origin}/book/${data.business.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyMessage('Booking link copied.');
    } catch {
      setCopyMessage('Copying was unavailable. Select the link and copy it instead.');
    }
  }

  return (
    <OwnerWorkspace>
      <div>
        <p className="text-sm font-semibold text-blue-700">Your business</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Overview</h1>
        <p className="mt-2 max-w-2xl text-slate-600">A clear view of your bookings and what is coming up.</p>
      </div>

      {loading ? <div className="mt-6 rounded-xl border border-slate-200 bg-white"><Loading label="Loading your overview" /></div>
        : error ? <section className="mt-6 rounded-xl border border-red-200 bg-white p-5" aria-labelledby="overview-error-title">
          <h2 id="overview-error-title" className="font-semibold text-slate-900">We couldn’t load your overview</h2>
          <p className="mt-2 text-sm text-red-800" role="alert">{error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">Try again</button>
        </section>
          : data && <div className="mt-6 space-y-6">
            <section aria-label="Booking counts" className="grid gap-3 sm:grid-cols-3">
              <CountCard label="Upcoming" value={data.dashboard.counts.upcoming} description="Confirmed appointments" />
              <CountCard label="Completed" value={data.dashboard.counts.completed} description="All time" />
              <CountCard label="Cancelled" value={data.dashboard.counts.cancelled} description="All time" />
            </section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
              <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="next-booking-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="next-booking-title" className="text-lg font-semibold text-slate-900">Next upcoming booking</h2>
                  <Link to="/app/bookings" className="min-h-11 inline-flex items-center rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">All bookings</Link>
                </div>
                {data.dashboard.nextBooking ? <div className="mt-4 rounded-lg bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">{data.dashboard.nextBooking.customerName}</p>
                  <p className="mt-1 text-sm text-slate-700">{data.dashboard.nextBooking.serviceName} · {data.dashboard.nextBooking.durationMinutes} minutes</p>
                  <p className="mt-2 text-sm text-slate-600">{formatBookingDateTime(data.dashboard.nextBooking.startsAt, data.dashboard.nextBooking.timezone)}</p>
                  <p className="mt-1 text-xs text-slate-500">Business time zone: {data.dashboard.nextBooking.timezone}</p>
                  <Link to={`/app/bookings/${data.dashboard.nextBooking.id}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900">View booking details</Link>
                </div> : <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-5">
                  <h3 className="font-semibold text-slate-900">No upcoming bookings</h3>
                  <p className="mt-1 text-sm text-slate-600">Confirmed appointments that start in the future will appear here.</p>
                </div>}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="share-booking-title">
                <h2 id="share-booking-title" className="text-lg font-semibold text-slate-900">Share your booking page</h2>
                <p className="mt-2 text-sm text-slate-600">Customers can book from your link without creating an account.</p>
                <label htmlFor="overview-booking-link" className="mt-4 block text-sm font-semibold text-slate-800">Booking link</label>
                <input id="overview-booking-link" readOnly value={`${window.location.origin}/book/${data.business.slug}`} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700" />
                <button type="button" onClick={() => void copyBookingLink()} className="mt-3 min-h-11 w-full rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800">Copy booking link</button>
                {copyMessage && <p role="status" className="mt-2 text-sm text-slate-600">{copyMessage}</p>}
              </section>
            </div>

            {(data.serviceCount === 0 || data.availabilityCount === 0) && <section className="rounded-xl border border-blue-200 bg-blue-50 p-5" aria-labelledby="finish-setup-title">
              <h2 id="finish-setup-title" className="font-semibold text-slate-900">Finish setting up your booking page</h2>
              <p className="mt-1 text-sm text-slate-700">Customers need an active service and at least one open weekday to book.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {data.serviceCount === 0 && <Link to="/app/services" className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-blue-800 ring-1 ring-blue-200 hover:bg-blue-100">Manage services</Link>}
                {data.availabilityCount === 0 && <Link to="/app/availability" className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-blue-800 ring-1 ring-blue-200 hover:bg-blue-100">Set weekly availability</Link>}
              </div>
            </section>}
          </div>}
    </OwnerWorkspace>
  );
}

function CountCard({ label, value, description }: { label: string; value: number; description: string }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5" aria-label={`${label} bookings`}>
    <p className="text-sm font-medium text-slate-600">{label}</p>
    <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
    <p className="mt-1 text-sm text-slate-500">{description}</p>
  </section>;
}
