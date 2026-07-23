import type {
  LearnerNotice,
  LearnerServiceOccurrence,
  LearnerServiceRecurrence,
} from '@/domain/models/entities';
import { formatShortDate, parseLocalDate } from '@/shared/dates/localDate';

const weekdayLabels = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function localDateWeekday(value: string): number | null {
  const parsed = parseLocalDate(value);
  if (!parsed) return null;
  const day = parsed.getDay();
  return day === 0 ? 7 : day;
}

export function learnerServiceOccursOnDate(
  notice: Pick<LearnerNotice, 'kind' | 'serviceRecurrence'>,
  date: string,
): boolean {
  if (notice.kind !== 'learner-service' || !notice.serviceRecurrence) return false;
  const recurrence = notice.serviceRecurrence;
  const weekday = localDateWeekday(date);
  if (weekday === null) return false;
  if (date < recurrence.startsOn) return false;
  if (recurrence.endsOn && date > recurrence.endsOn) return false;
  return recurrence.weekdays.includes(weekday);
}

export function learnerServiceOccurrenceIsClosed(
  occurrences: readonly LearnerServiceOccurrence[],
  learnerNoticeId: string,
  date: string,
): boolean {
  return occurrences.some(
    (occurrence) => occurrence.learnerNoticeId === learnerNoticeId && occurrence.date === date,
  );
}

export function formatClockMinute(minute: number): string {
  const hour24 = Math.floor(minute / 60);
  const minutePart = minute % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minutePart).padStart(2, '0')} ${suffix}`;
}

export function formatLearnerServiceTime(recurrence: LearnerServiceRecurrence): string {
  return `${formatClockMinute(recurrence.startMinute)}–${formatClockMinute(recurrence.endMinute)}`;
}

export function formatLearnerServiceRecurrence(recurrence: LearnerServiceRecurrence): string {
  const days = recurrence.weekdays
    .map((weekday) => weekdayLabels[weekday] ?? String(weekday))
    .join(', ');
  const range = recurrence.endsOn
    ? `${formatShortDate(recurrence.startsOn)}–${formatShortDate(recurrence.endsOn)}`
    : `from ${formatShortDate(recurrence.startsOn)}`;
  return `Every ${days} · ${formatLearnerServiceTime(recurrence)} · ${range}`;
}

export function learnerServiceOccurrenceId(learnerNoticeId: string, date: string): string {
  return `${learnerNoticeId}:${date}`;
}
