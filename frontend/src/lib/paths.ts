export function safeReturnPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith('/app') || candidate.startsWith('//')) {
    return '/app';
  }

  try {
    const parsed = new URL(candidate, 'https://opna.local');
    if (parsed.origin !== 'https://opna.local' || !(parsed.pathname === '/app' || parsed.pathname.startsWith('/app/'))) {
      return '/app';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/app';
  }
}
