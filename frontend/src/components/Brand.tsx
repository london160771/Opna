import { Link } from 'react-router-dom';

export function Brand() {
  return (
    <Link to="/" aria-label="Opna home" className="inline-flex items-center gap-2 font-semibold tracking-tight text-slate-900">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-xl bg-blue-700 text-sm font-bold text-white">o</span>
      <span className="text-lg">opna</span>
    </Link>
  );
}
