import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicBusiness, getPublicSlots, PublicApiError, submitPublicBooking, type BookingConfirmation, type PublicBusiness, type PublicSlot } from '../api/public';
import { Brand } from '../components/Brand';
import { Loading } from '../components/Loading';

function formatLocalDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatTime(instant: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(instant));
}

function formatZonedDateTime(instant: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(instant));
}

export function PublicBookingPage() {
  const { slug = '' } = useParams();
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [businessAttempt, setBusinessAttempt] = useState(0);
  const [businessError, setBusinessError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [slotAttempt, setSlotAttempt] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setBusinessLoading(true);
    setBusinessError('');
    setNotFound(false);
    setBusiness(null);
    setServiceId('');
    setDate('');
    setSelectedSlot(null);
    void getPublicBusiness(slug, controller.signal)
      .then((result) => {
        setBusiness(result);
        setDate(result.bookingWindow.today);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof PublicApiError && error.status === 404) setNotFound(true);
        else setBusinessError(error instanceof Error ? error.message : 'We could not load this booking page.');
      })
      .finally(() => { if (!controller.signal.aborted) setBusinessLoading(false); });
    return () => controller.abort();
  }, [businessAttempt, slug]);

  useEffect(() => {
    if (!business || !serviceId || !date || !business.isBookable) {
      setSlots([]);
      setSlotsLoading(false);
      setSlotsError('');
      return;
    }
    const controller = new AbortController();
    setSlots([]);
    setSlotsLoading(true);
    setSlotsError('');
    void getPublicSlots(slug, serviceId, date, controller.signal)
      .then((result) => setSlots(result.slots))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof PublicApiError && error.code === 'DATE_OUT_OF_RANGE') {
          setServiceId('');
          setSelectedSlot(null);
          setBusinessAttempt((value) => value + 1);
          return;
        }
        setSlotsError(error instanceof Error ? error.message : 'We could not load available times.');
      })
      .finally(() => { if (!controller.signal.aborted) setSlotsLoading(false); });
    return () => controller.abort();
  }, [business, date, serviceId, slotAttempt, slug]);

  const selectedService = useMemo(
    () => business?.services.find((service) => service.id === serviceId) ?? null,
    [business, serviceId],
  );

  function changeService(nextServiceId: string) {
    setServiceId(nextServiceId);
    setSelectedSlot(null);
    setSubmitError('');
    setFieldErrors({});
  }

  function changeDate(nextDate: string) {
    setDate(nextDate);
    setSelectedSlot(null);
    setSubmitError('');
    setFieldErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!customerName.trim()) errors.customerName = 'Enter your name.';
    else if (customerName.trim().length > 120) errors.customerName = 'Use 120 characters or fewer.';
    if (!customerEmail.trim()) errors.customerEmail = 'Enter your email address.';
    else if (customerEmail.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) errors.customerEmail = 'Enter a valid email address.';
    setFieldErrors(errors);
    setSubmitError('');
    if (Object.keys(errors).length) {
      if (errors.customerName) nameRef.current?.focus();
      else emailRef.current?.focus();
      return;
    }
    if (!business || !selectedService || !selectedSlot) return;

    setSubmitting(true);
    try {
      const result = await submitPublicBooking(slug, {
        serviceId: selectedService.id,
        startsAt: selectedSlot.startsAt,
        customerName,
        customerEmail,
      });
      setConfirmation(result);
    } catch (error) {
      if (error instanceof PublicApiError && error.code === 'SLOT_UNAVAILABLE') {
        setSelectedSlot(null);
        setSubmitError('That time was just taken. Choose another available time; your details are still here.');
        setSlotAttempt((value) => value + 1);
      } else if (error instanceof PublicApiError && error.code === 'DATE_OUT_OF_RANGE') {
        setSelectedSlot(null);
        setServiceId('');
        setSubmitError('The booking date window has changed. Choose a current date and time again; your details are still here.');
        setBusinessAttempt((value) => value + 1);
      } else if (error instanceof PublicApiError && error.fields.customerName) {
        setFieldErrors({ customerName: error.fields.customerName });
        nameRef.current?.focus();
      } else if (error instanceof PublicApiError && error.fields.customerEmail) {
        setFieldErrors({ customerEmail: error.fields.customerEmail });
        emailRef.current?.focus();
      } else {
        setSubmitError(error instanceof Error ? error.message : 'We could not confirm your booking. Your details are still here; try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><Brand /><Link to="/" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">Opna home</Link></div>
      </header>
      {businessLoading ? <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8"><Loading label="Loading booking page" /></main>
        : notFound ? <main className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="text-2xl font-semibold text-slate-900">Booking page not found</h1><p className="mt-2 text-slate-600">That business link may be incorrect. Search for a business you know from the Opna home page.</p><Link to="/#find-business" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800">Find a business</Link></main>
          : businessError ? <main className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="text-2xl font-semibold text-slate-900">We couldn’t load this booking page</h1><p className="mt-2 text-slate-600" role="alert">{businessError}</p><button type="button" onClick={() => window.location.reload()} className="mt-6 min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800">Try again</button></main>
            : business && <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[minmax(250px,0.75fr)_minmax(0,1.25fr)] lg:items-start lg:gap-8">
              <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <p className="text-sm font-semibold text-blue-700">Booking page</p>
                <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-900">{business.name}</h1>
                <p className="mt-3 text-sm text-slate-600">Choose a service and a time that works for you.</p>
                <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Business time zone</p><p className="mt-1 break-all font-medium text-slate-900">{business.timezone}</p><p className="mt-1 text-sm text-slate-600">All times on this page use this time zone.</p></div>
                {!business.isBookable && <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">This business is not accepting bookings yet. Please check back later.</p>}
              </aside>

              {confirmation ? <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm sm:p-8" aria-live="polite" aria-labelledby="confirmation-title">
                <p className="text-sm font-semibold text-emerald-800">Confirmed</p><h2 id="confirmation-title" className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Booking confirmed</h2>
                <p className="mt-2 text-slate-600">Your appointment is confirmed. Keep this reference for your records.</p>
                <dl className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 px-4">
                  <SummaryRow label="Business" value={confirmation.businessName} /><SummaryRow label="Service" value={`${confirmation.serviceName} · ${confirmation.durationMinutes} minutes`} />
                  <SummaryRow label="Date and time" value={formatZonedDateTime(confirmation.startsAt, confirmation.timezone)} /><SummaryRow label="Time zone" value={confirmation.timezone} />
                  <SummaryRow label="Status" value="Confirmed" /><SummaryRow label="Reference" value={confirmation.reference} />
                </dl>
              </section> : <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="booking-title">
                <div><p className="text-sm font-semibold text-blue-700">Book an appointment</p><h2 id="booking-title" className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Choose a time</h2><p className="mt-2 text-sm text-slate-600">No account is needed. Your email is shared with the business as contact information.</p></div>
                {business.isBookable ? <>
                  <fieldset className="mt-7"><legend className="text-base font-semibold text-slate-900">1. Select a service</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {business.services.map((service) => <label key={service.id} className="cursor-pointer">
                      <input className="peer sr-only" type="radio" name="service" value={service.id} checked={serviceId === service.id} onChange={() => changeService(service.id)} />
                      <span className="flex min-h-[76px] items-center justify-between gap-3 rounded-xl border border-slate-300 p-4 transition-colors peer-checked:border-blue-700 peer-checked:bg-blue-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-blue-500">
                        <span className="min-w-0"><span className="block break-words font-semibold text-slate-900">{service.name}</span><span className="mt-1 block text-sm text-slate-600">{service.durationMinutes} minutes</span></span>
                        <span aria-hidden="true" className={`size-5 shrink-0 rounded-full border ${serviceId === service.id ? 'border-[6px] border-blue-700' : 'border-slate-400'}`} />
                      </span>
                    </label>)}
                  </div></fieldset>

                  <section className="mt-7 border-t border-slate-200 pt-6" aria-labelledby="date-time-title">
                    <h3 id="date-time-title" className="text-base font-semibold text-slate-900">2. Choose a date and time</h3>
                    <label htmlFor="booking-date" className="mt-3 block text-sm font-medium text-slate-800">Appointment date</label>
                    <input id="booking-date" type="date" min={business.bookingWindow.today} max={business.bookingWindow.lastBookableDate} value={date} disabled={!serviceId} onChange={(event) => changeDate(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 disabled:bg-slate-100 sm:max-w-xs" />
                    <p className="mt-1 text-sm text-slate-600">Choose a date through {formatLocalDate(business.bookingWindow.lastBookableDate)}. Times shown below use {business.timezone}.</p>
                    {!serviceId ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Select a service to see available dates and times.</p>
                      : slotsLoading ? <div className="mt-4 rounded-lg bg-slate-50"><Loading label="Loading available times" /></div>
                        : slotsError ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4"><p className="text-sm text-red-800" role="alert">{slotsError}</p><button type="button" onClick={() => { setSelectedSlot(null); setSlotAttempt((value) => value + 1); }} className="mt-2 min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-white">Try again</button></div>
                          : slots.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700" role="status">No times are available on this date. Choose another date to check again.</p>
                            : <fieldset className="mt-4"><legend className="text-sm font-medium text-slate-800">Available times</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {slots.map((slot) => <button key={slot.startsAt} type="button" aria-pressed={selectedSlot?.startsAt === slot.startsAt} onClick={() => { setSelectedSlot(slot); setSubmitError(''); }} className={`min-h-12 rounded-lg border px-3 font-semibold transition-colors ${selectedSlot?.startsAt === slot.startsAt ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-800 hover:border-blue-500 hover:bg-blue-50'}`}>{formatTime(slot.startsAt, business.timezone)}</button>)}
                            </div></fieldset>}
                    {submitError && !selectedSlot && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{submitError}</p>}
                  </section>

                  {selectedSlot && selectedService && <form onSubmit={(event) => void submit(event)} noValidate className="mt-7 border-t border-slate-200 pt-6">
                    <h3 className="text-base font-semibold text-slate-900">3. Your details</h3><p className="mt-1 text-sm text-slate-600">The business will use these details to identify your booking.</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div><label htmlFor="customer-name" className="block text-sm font-medium text-slate-800">Name</label><input ref={nameRef} id="customer-name" name="name" autoComplete="name" maxLength={120} required value={customerName} onChange={(event) => setCustomerName(event.target.value)} aria-invalid={Boolean(fieldErrors.customerName)} aria-describedby={fieldErrors.customerName ? 'customer-name-error' : undefined} className="mt-1 min-h-12 w-full rounded-lg border border-slate-300 px-3" />{fieldErrors.customerName && <p id="customer-name-error" className="mt-1 text-sm text-red-700">{fieldErrors.customerName}</p>}</div>
                      <div><label htmlFor="customer-email" className="block text-sm font-medium text-slate-800">Email</label><input ref={emailRef} id="customer-email" name="email" type="email" autoComplete="email" maxLength={254} required value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} aria-invalid={Boolean(fieldErrors.customerEmail)} aria-describedby={fieldErrors.customerEmail ? 'customer-email-error' : undefined} className="mt-1 min-h-12 w-full rounded-lg border border-slate-300 px-3" />{fieldErrors.customerEmail && <p id="customer-email-error" className="mt-1 text-sm text-red-700">{fieldErrors.customerEmail}</p>}</div>
                    </div>
                    <div className="mt-5 rounded-xl bg-slate-50 p-4"><h4 className="font-semibold text-slate-900">Review your appointment</h4><dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2"><SummaryRow label="Service" value={`${selectedService.name} · ${selectedService.durationMinutes} minutes`} /><SummaryRow label="Date" value={formatLocalDate(date)} /><SummaryRow label="Time" value={formatTime(selectedSlot.startsAt, business.timezone)} /><SummaryRow label="Time zone" value={business.timezone} /></dl></div>
                    {submitError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{submitError}</p>}
                    <button type="submit" disabled={submitting} className="mt-5 min-h-12 w-full rounded-lg bg-blue-700 px-5 font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">{submitting ? 'Confirming booking…' : 'Confirm booking'}</button>
                  </form>}
                </> : <p className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-700" role="status">This business is not accepting bookings yet. Please check back later.</p>}
              </section>}
            </main>}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 py-3 sm:grid-cols-[120px_1fr] sm:gap-3"><dt className="text-sm text-slate-600">{label}</dt><dd className="break-words text-sm font-medium text-slate-900">{value}</dd></div>;
}
