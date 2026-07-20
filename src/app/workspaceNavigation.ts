import { parseLocalDate } from '@/shared/dates/localDate';

const contextAwareRoutes = new Set([
  '/today',
  '/week',
  '/calendar',
  '/agenda',
  '/tasks',
  '/learners',
]);

const workspaceContextKeys = ['context', 'status', 'planning'] as const;

export function buildShellNavigationHref(to: string, currentSearch: string): string {
  if (!contextAwareRoutes.has(to)) return to;

  const current = new URLSearchParams(currentSearch);
  const next = new URLSearchParams();
  const date = current.get('date');

  if (parseLocalDate(date)) next.set('date', date!);

  for (const key of workspaceContextKeys) {
    const value = current.get(key)?.trim();
    if (value) next.set(key, value);
  }

  const query = next.toString();
  return query ? `${to}?${query}` : to;
}
