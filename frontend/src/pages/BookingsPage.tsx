import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOwnerBookings, type OwnerBooking } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { BookingStatusBadge } from '../components/BookingStatusBadge';
import { Loading } from '../components/Loading';
import { formatBookingDateTime } from '../lib/bookingFormat';

export function BookingsPage() {
  const { session } = useAuth();
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    void getOwnerBookings(session.access_token)
      .then((page) => {
        if (!active) return;
        setBookings(page.bookings);
        setCursor(page.nextCursor);
      })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : 'We could not load your bookings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, session?.user.id]);

  async function loadMore() {
    if (!session || !cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError('');
    try {
      const page = await getOwnerBookings(session.access_token, cursor);
      setBookings((current) => [...current, ...page.bookings]);
      setCursor(page.nextCursor);
    } catch (error) {
      setMoreError(error instanceof Error ? error.message : 'We could not load more bookings.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <div>
        <p className="text-sm font-semibold text-blue-700">Appointments</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Bookings</h1>
        <p className="mt-2 max-w-2xl text-slate-600">Appointments are shown with the business time zone and saved service details.</p>
      </div>

      {loading ? <div className="mt-6 rounded-xl border border-slate-200 bg-white"><Loading label="Loading bookings" /></div>
        : loadError ? <section className="mt-6 rounded-xl border border-red-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">We couldn’t load your bookings</h2>
          <p className="mt-2 text-sm text-red-800" role="alert">{loadError}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">Try again</button>
        </section>
          : bookings.length === 0 ? <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="text-lg font-semibold text-slate-900">No bookings yet</h2>
            <p className="mt-2 text-slate-600">New customer appointments will appear here after they book.</p>
            <Link to="/app" className="mt-4 inline-flex min-h-11 items-center rounded-lg px-4 font-semibold text-blue-700 hover:bg-blue-50">Back to overview</Link>
          </section>
            : <>
              <div className="mt-6 hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr><th scope="col" className="px-5 py-3 font-semibold">Customer</th><th scope="col" className="px-5 py-3 font-semibold">Service</th><th scope="col" className="px-5 py-3 font-semibold">Date and time</th><th scope="col" className="px-5 py-3 font-semibold">Status</th><th scope="col" className="px-5 py-3"><span className="sr-only">Booking details</span></th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {bookings.map((booking) => <tr key={booking.id}>
                        <td className="max-w-56 break-words px-5 py-4 font-medium text-slate-900">{booking.customerName}</td>
                        <td className="max-w-64 break-words px-5 py-4 text-sm text-slate-700">{booking.serviceName}<span className="mt-1 block text-xs text-slate-500">{booking.durationMinutes} minutes</span></td>
                        <td className="px-5 py-4 text-sm text-slate-700">{formatBookingDateTime(booking.startsAt, booking.timezone)}<span className="mt-1 block text-xs text-slate-500">{booking.timezone}</span></td>
                        <td className="px-5 py-4"><BookingStatusBadge status={booking.status} /></td>
                        <td className="px-5 py-4 text-right"><Link to={`/app/bookings/${booking.id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">View details</Link></td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 space-y-3 lg:hidden">
                {bookings.map((booking) => <article key={booking.id} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="break-words font-semibold text-slate-900">{booking.customerName}</h2><BookingStatusBadge status={booking.status} /></div>
                  <p className="mt-3 break-words text-sm text-slate-700">{booking.serviceName} · {booking.durationMinutes} minutes</p>
                  <p className="mt-2 text-sm text-slate-700">{formatBookingDateTime(booking.startsAt, booking.timezone)}</p>
                  <p className="mt-1 text-xs text-slate-500">Business time zone: {booking.timezone}</p>
                  <Link to={`/app/bookings/${booking.id}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900">View booking details</Link>
                </article>)}
              </div>
              {moreError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{moreError}</p>}
              {cursor && <div className="mt-5 text-center"><button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="min-h-11 rounded-lg border border-slate-300 bg-white px-5 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">{loadingMore ? 'Loading…' : 'Load more bookings'}</button></div>}
            </>}
    </>
  );
}
