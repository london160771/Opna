export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center" role="status" aria-live="polite">
      <span className="text-sm font-medium text-slate-600">{label}…</span>
    </div>
  );
}
