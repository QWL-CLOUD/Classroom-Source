import { format } from 'date-fns';

import type { CalendarDayItem, CalendarDayReadModel } from './calendarReadModel';
import { getMonday, parseLocalDate } from '@/shared/dates/localDate';

export interface CalendarItemCounts {
  schedule: number;
  events: number;
  sessions: number;
}

export interface CalendarDaySections {
  datedItems: CalendarDayItem[];
  highlightedDatedItems: CalendarDayItem[];
  hiddenDatedItems: CalendarDayItem[];
  scheduleItems: CalendarDayItem[];
  counts: CalendarItemCounts;
}

export interface CalendarWeekPresentation {
  id: string;
  startDate: string;
  endDate: string;
  label: string;
  days: CalendarDayReadModel[];
  counts: CalendarItemCounts;
  containsSelectedDate: boolean;
  containsToday: boolean;
}

export function getCalendarItemCounts(items: readonly CalendarDayItem[]): CalendarItemCounts {
  return items.reduce<CalendarItemCounts>(
    (counts, item) => {
      if (item.sourceType === 'schedule-block') counts.schedule += 1;
      else if (item.sourceType === 'calendar-event') counts.events += 1;
      else counts.sessions += 1;
      return counts;
    },
    { schedule: 0, events: 0, sessions: 0 },
  );
}

export function splitCalendarDayItems(
  items: readonly CalendarDayItem[],
  highlightedDatedLimit = 3,
): CalendarDaySections {
  const datedItems = items.filter(
    (item) => item.sourceType !== 'schedule-block' || item.scheduleExceptionAction !== undefined,
  );
  const scheduleItems = items.filter(
    (item) => item.sourceType === 'schedule-block' && item.scheduleExceptionAction === undefined,
  );

  return {
    datedItems,
    highlightedDatedItems: datedItems.slice(0, highlightedDatedLimit),
    hiddenDatedItems: datedItems.slice(highlightedDatedLimit),
    scheduleItems,
    counts: getCalendarItemCounts(items),
  };
}

function formatWeekLabel(startDate: string, endDate: string): string {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end) return `${startDate}–${endDate}`;

  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, 'MMM d, yyyy')}–${format(end, 'MMM d, yyyy')}`;
  }

  if (start.getMonth() !== end.getMonth()) {
    return `${format(start, 'MMM d')}–${format(end, 'MMM d, yyyy')}`;
  }

  return `${format(start, 'MMM d')}–${format(end, 'd, yyyy')}`;
}

export function buildCalendarWeekPresentation(
  days: readonly CalendarDayReadModel[],
  selectedDate: string,
  currentDate: string,
): CalendarWeekPresentation[] {
  const grouped = new Map<string, CalendarDayReadModel[]>();

  days.forEach((day) => {
    const weekId = getMonday(day.date);
    const weekDays = grouped.get(weekId) ?? [];
    weekDays.push(day);
    grouped.set(weekId, weekDays);
  });

  return [...grouped.entries()].map(([id, weekDays]) => {
    const startDate = weekDays[0]?.date ?? id;
    const endDate = weekDays.at(-1)?.date ?? id;
    const items = weekDays.flatMap((day) => day.items);

    return {
      id,
      startDate,
      endDate,
      label: formatWeekLabel(startDate, endDate),
      days: weekDays,
      counts: getCalendarItemCounts(items),
      containsSelectedDate: weekDays.some((day) => day.date === selectedDate),
      containsToday: weekDays.some((day) => day.date === currentDate),
    };
  });
}
