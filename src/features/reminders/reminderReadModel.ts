import type {
  CalendarEvent,
  LearnerNotice,
  LessonPlan,
  Reminder,
  ReminderSourceType,
  SessionOccurrence,
  Task,
} from '@/domain/models/entities';
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import { shiftDays } from '@/shared/dates/localDate';

export interface ReminderSourceSnapshot {
  tasks: readonly Task[];
  sessions: readonly SessionOccurrence[];
  lessonPlans: readonly LessonPlan[];
  calendarEvents: readonly CalendarEvent[];
  learnerNotices: readonly LearnerNotice[];
}

export interface ReminderListItem extends Reminder {
  sourceTitle: string;
  sourceTypeLabel: string;
  sourceAvailable: boolean;
  sourceHref?: string;
  timeLabel: string;
}

export function formatReminderMinute(minute: number): string {
  return formatCalendarMinute(minute);
}

export function sourceTypeLabel(sourceType: ReminderSourceType): string {
  if (sourceType === 'task') return 'Task';
  if (sourceType === 'session') return 'Session';
  if (sourceType === 'calendar-event') return 'Calendar event';
  return 'Learner notice';
}

function sourceDetails(
  reminder: Reminder,
  snapshot: ReminderSourceSnapshot,
): Pick<ReminderListItem, 'sourceTitle' | 'sourceAvailable' | 'sourceHref'> {
  if (reminder.sourceType === 'task') {
    const source = snapshot.tasks.find((task) => task.id === reminder.sourceId);
    return {
      sourceTitle: source?.title ?? 'Unavailable task',
      sourceAvailable: Boolean(source),
      sourceHref: source ? '#/tasks' : undefined,
    };
  }
  if (reminder.sourceType === 'calendar-event') {
    const source = snapshot.calendarEvents.find((event) => event.id === reminder.sourceId);
    return {
      sourceTitle: source?.title ?? 'Unavailable calendar event',
      sourceAvailable: Boolean(source),
      sourceHref: source ? `#/calendar/events?date=${source.startDate}` : undefined,
    };
  }
  if (reminder.sourceType === 'session') {
    const source = snapshot.sessions.find((session) => session.id === reminder.sourceId);
    const plan = source
      ? snapshot.lessonPlans.find((item) => item.id === source.lessonPlanId)
      : undefined;
    return {
      sourceTitle: plan?.title ?? (source ? 'Planned session' : 'Unavailable session'),
      sourceAvailable: Boolean(source),
      sourceHref: source
        ? `#/session?session=${source.id}&date=${source.date}&return=today`
        : undefined,
    };
  }
  const source = snapshot.learnerNotices.find((notice) => notice.id === reminder.sourceId);
  return {
    sourceTitle: source?.title ?? 'Unavailable learner notice',
    sourceAvailable: Boolean(source),
    sourceHref: source
      ? `#/learners?context=${encodeURIComponent(source.contextId)}&support=active`
      : undefined,
  };
}

export function buildReminderListItems(
  reminders: readonly Reminder[],
  snapshot: ReminderSourceSnapshot,
): ReminderListItem[] {
  return reminders
    .map((reminder) => ({
      ...reminder,
      ...sourceDetails(reminder, snapshot),
      sourceTypeLabel: sourceTypeLabel(reminder.sourceType),
      timeLabel: formatReminderMinute(reminder.remindMinute),
    }))
    .sort(
      (first, second) =>
        first.remindDate.localeCompare(second.remindDate) ||
        first.remindMinute - second.remindMinute ||
        first.sourceTitle.localeCompare(second.sourceTitle) ||
        first.id.localeCompare(second.id),
    );
}

export function selectActiveRemindersForDate(
  reminders: readonly Reminder[],
  date: string,
): Reminder[] {
  return reminders
    .filter((reminder) => reminder.status === 'active' && reminder.remindDate === date)
    .sort(
      (first, second) =>
        first.remindMinute - second.remindMinute ||
        first.sourceType.localeCompare(second.sourceType) ||
        first.sourceId.localeCompare(second.sourceId) ||
        first.id.localeCompare(second.id),
    );
}

export function shiftReminderSchedule(
  remindDate: string,
  remindMinute: number,
  deltaMinutes: number,
): { remindDate: string; remindMinute: number } {
  const total = remindMinute + deltaMinutes;
  const dayOffset = Math.floor(total / 1440);
  const normalizedMinute = ((total % 1440) + 1440) % 1440;
  return {
    remindDate: shiftDays(remindDate, dayOffset),
    remindMinute: normalizedMinute,
  };
}
