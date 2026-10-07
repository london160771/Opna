import type { BookingStatus } from '../api/owner';

const statusStyles: Record<BookingStatus, string> = {
  confirmed: 'border-blue-200 bg-blue-50 text-blue-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-700',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${statusStyles[status]}`}>{label}</span>;
}
