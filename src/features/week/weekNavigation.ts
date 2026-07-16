import type { WeekViewFilter } from '@/features/week/weekReadModel';
import { parseLocalDate } from '@/shared/dates/localDate';

export type WeekViewQuery = 'schedule' | 'events' | 'personal' | 'everything';

const queryToFilter: Record<WeekViewQuery, WeekViewFilter> = {
  schedule: 'teaching',
  events: 'calendar',
  personal: 'personal',
  everything: 'everything',
};

const filterToQuery: Record<WeekViewFilter, WeekViewQuery> = {
  teaching: 'schedule',
  calendar: 'events',
  personal: 'personal',
  everything: 'everything',
};

export function parseWeekViewQuery(value: string | null): WeekViewFilter | null {
  if (!value) return null;

  // Accept old internal names so bookmarked Phase 2 links remain usable.
  if (value === 'teaching') return 'teaching';
  if (value === 'calendar') return 'calendar';

  return value in queryToFilter ? queryToFilter[value as WeekViewQuery] : null;
}

export function toWeekViewQuery(view: WeekViewFilter): WeekViewQuery {
  return filterToQuery[view];
}

export interface BuildWeekHrefOptions {
  date: string;
  view: WeekViewQuery;
  focus?: string;
}

export function buildWeekHref({ date, view, focus }: BuildWeekHrefOptions): string {
  if (!parseLocalDate(date)) throw new Error(`Invalid Week date: ${date}`);

  const params = new URLSearchParams({ date, view });
  if (focus) params.set('focus', focus);
  return `#/week?${params.toString()}`;
}
