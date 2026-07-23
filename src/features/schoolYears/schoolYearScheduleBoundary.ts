import type { ScheduleException, SchoolYear } from '@/domain/models/entities';

export type SchoolYearScheduleBoundary = Pick<SchoolYear, 'startsOn' | 'endsOn'>;

/**
 * A missing boundary preserves the read-model API's unbounded behavior.
 * School Year limits apply only when an active School Year actually exists.
 * This avoids hiding established schedules while a school is configuring its
 * first year or while the active-year live query is loading.
 */
export function dateAllowsDefaultSchedule(
  date: string,
  boundary?: SchoolYearScheduleBoundary | null,
): boolean {
  if (boundary == null) return true;
  return boundary.startsOn <= date && date <= boundary.endsOn;
}

/**
 * An explicit `add` exception is a dated addition rather than a generated
 * default occurrence, so it remains visible outside the School Year.
 */
export function scheduleOccurrenceIsVisibleForSchoolYear(
  date: string,
  exceptionAction: ScheduleException['action'] | undefined,
  boundary?: SchoolYearScheduleBoundary | null,
): boolean {
  return exceptionAction === 'add' || dateAllowsDefaultSchedule(date, boundary);
}
