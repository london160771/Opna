import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getOwnerBooking, OwnerApiError, updateOwnerBookingStatus, type OwnerBooking } from '../api/owner';
import { useAuth } from '../auth/AuthProvider';
import { BookingStatusBadge } from '../components/BookingStatusBadge';
import { Loading } from '../components/Loading';
import { OwnerWorkspace } from '../components/OwnerWorkspace';
import { formatBookingDate, formatBookingTime } from '../lib/bookingFormat';

export function BookingDetailsPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const [booking, setBooking] = useState<OwnerBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session || !id) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    void getOwnerBooking(session.access_token, id)
      .then((result) => { if (active) setBooking(result); })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'We could not load this booking.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, id, session?.access_token]);

  async function changeStatus(status: 'completed' | 'cancelled') {
    if (!session || !booking || saving) return;
    if (status === 'cancelled' && !window.confirm('Cancel this booking? This releases the appointment time and does not notify the customer.')) return;
    setSaving(true);
    setActionError('');
    setActionMessage('');
    try {
      const updated = await updateOwnerBookingStatus(session.access_token, booking.id, status);
      setBooking(updated);
      setActionMessage(status === 'cancelled' ? 'Booking cancelled. Its time is available again.' : 'Booking marked as completed.');
    } catch (error) {
      setActionError(error instanceof OwnerApiError ? error.message : error instanceof Error ? error.message : 'We could not update this booking. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const canComplete = Boolean(booking && Date.parse(booking.endsAt) <= now);

  return (
    <OwnerWorkspace>
      <Link to="/app/bookings" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">← Back to bookings</Link>
      {loading ? <div className="mt-4 rounded-xl border border-slate-200 bg-white"><Loading label="Loading booking details" /></div>
        : loadError ? <section className="mt-4 max-w-2xl rounded-xl border border-red-200 bg-white p-5">
          <h1 className="text-xl font-semibold text-slate-900">We couldn’t load this booking</h1>
          <p role="alert" className="mt-2 text-sm text-red-800">{loadError}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">Try again</button>
        </section>
          : booking && <div className="mt-4 max-w-3xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-sm font-semibold text-blue-700">Appointment</p><h1 className="mt-1 break-words text-3xl font-semibold tracking-tight text-slate-900">Booking details</h1></div>
              <BookingStatusBadge status={booking.status} />
            </div>

            <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="appointment-heading">
              <h2 id="appointment-heading" className="text-lg font-semibold text-slate-900">Appointment</h2>
              <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <Detail label="Customer" value={booking.customerName} />
                <div><dt className="text-sm text-slate-600">Email</dt><dd className="mt-1 break-all font-medium text-slate-900">{booking.customerEmail ? <a className="underline decoration-slate-300 underline-offset-4 hover:text-blue-800" href={`mailto:${booking.customerEmail}`}>{booking.customerEmail}</a> : 'Email unavailable'}</dd></div>
                <Detail label="Service" value={booking.serviceName} />
                <Detail label="Duration" value={`${booking.durationMinutes} minutes`} />
                <Detail label="Date" value={formatBookingDate(booking.startsAt, booking.timezone)} />
                <Detail label="Time" value={`${formatBookingTime(booking.startsAt, booking.timezone)}–${formatBookingTime(booking.endsAt, booking.timezone)}`} />
                <Detail label="Business time zone" value={booking.timezone} />
                <Detail label="Reference" value={booking.id} />
              </dl>
            </section>

            {booking.status === 'confirmed' && <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="booking-actions-heading">
              <h2 id="booking-actions-heading" className="text-lg font-semibold text-slate-900">Update booking status</h2>
              <p className="mt-1 text-sm text-slate-600">Completed appointments keep their time reserved. Cancelling releases this time and does not notify the customer.</p>
              {actionError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}
              {actionMessage && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{actionMessage}</p>}
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button type="button" disabled={!canComplete || saving} onClick={() => void changeStatus('completed')} className="min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Mark as completed'}</button>
                <button type="button" disabled={saving} onClick={() => void changeStatus('cancelled')} className="min-h-11 rounded-lg border border-red-300 px-4 font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50">Cancel booking</button>
              </div>
              {!canComplete && <p className="mt-3 text-sm text-slate-500">You can mark this appointment complete after it has ended.</p>}
            </section>}

            {booking.status !== 'confirmed' && <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5" aria-live="polite">
              <h2 className="font-semibold text-slate-900">This booking is {booking.status}.</h2>
              <p className="mt-1 text-sm text-slate-600">Booking status cannot be changed again.</p>
              {actionMessage && <p role="status" className="mt-3 text-sm text-emerald-900">{actionMessage}</p>}
              {actionError && <p role="alert" className="mt-3 text-sm text-red-800">{actionError}</p>}
            </section>}
          </div>}
    </OwnerWorkspace>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 break-words font-medium text-slate-900">{value}</dd></div>;
}
