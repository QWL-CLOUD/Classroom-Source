import {
  calendarEventSchema,
  learnerContextSchema,
  learnerNoticeSchema,
  lessonPlanSchema,
  reminderSchema,
  sessionOccurrenceSchema,
  taskSchema,
  type CalendarEvent,
  type LearnerContext,
  type LearnerNotice,
  type LessonPlan,
  type Reminder,
  type SessionOccurrence,
  type Task,
  type TaskStatus,
} from '@/domain/models/entities';
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import { buildReminderListItems } from '@/features/reminders/reminderReadModel';
import { learnerNoticeKindLabel } from '@/features/learnerNotices/learnerNoticeReadModel';
import { formatShortDate } from '@/shared/dates/localDate';

export type AgendaSectionId =
  'overdue' | 'today' | 'upcoming' | 'waiting' | 'unscheduled-follow-up';

export type AgendaSourceType = 'task' | 'reminder' | 'calendar-event' | 'learner-notice';

export interface AgendaItem {
  id: string;
  sourceType: AgendaSourceType;
  sourceId: string;
  title: string;
  sourceLabel: string;
  timingLabel: string;
  detailLabel?: string;
  contextName?: string;
  href: string;
  section: AgendaSectionId;
  sortDate: string;
  sortMinute: number;
  taskStatus?: TaskStatus;
  remindDate?: string;
  remindMinute?: number;
  reminderNote?: string;
}

export interface AgendaSection {
  id: AgendaSectionId;
  label: string;
  description: string;
  items: AgendaItem[];
}

export interface AgendaSummary {
  overdue: number;
  today: number;
  upcoming: number;
  waiting: number;
  unscheduledFollowUp: number;
  total: number;
}

export interface AgendaReadModel {
  selectedDate: string;
  sections: AgendaSection[];
  summary: AgendaSummary;
}

export interface AgendaSourceSnapshot {
  tasks: readonly Task[];
  reminders: readonly Reminder[];
  calendarEvents: readonly CalendarEvent[];
  learnerNotices: readonly LearnerNotice[];
  learnerContexts: readonly LearnerContext[];
  sessions: readonly SessionOccurrence[];
  lessonPlans: readonly LessonPlan[];
}

const sectionMetadata: Record<AgendaSectionId, Pick<AgendaSection, 'label' | 'description'>> = {
  overdue: {
    label: 'Overdue',
    description: 'Active deadlines, reminders, and date-specific notices from before this date.',
  },
  today: {
    label: 'Today',
    description:
      'Scheduled work, due items, active reminders, personal events, and learner support.',
  },
  upcoming: {
    label: 'Upcoming',
    description: 'The next dated items from the records already managed across Classroom.',
  },
  waiting: {
    label: 'Waiting',
    description:
      'Tasks intentionally paused while you wait for another person, resource, or decision.',
  },
  'unscheduled-follow-up': {
    label: 'Unscheduled follow-up',
    description:
      'Active follow-up Tasks created from learner notices without a scheduled or due date.',
  },
};

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

export function isPersonalCalendarEvent(event: CalendarEvent): boolean {
  const classification = `${normalizeText(event.category)} ${normalizeText(event.title)}`;
  return /(^|\s)(personal|private|home)(\s|$)/u.test(classification);
}

function minuteOrEnd(value: number | undefined): number {
  return value ?? 1440;
}

function formatDateAndMinute(date: string, minute: number | undefined): string {
  return `${formatShortDate(date)}${minute === undefined ? '' : ` at ${formatCalendarMinute(minute)}`}`;
}

function taskTimingLabel(task: Task): string {
  const labels: string[] = [];
  if (task.scheduledDate) {
    labels.push(`Scheduled ${formatDateAndMinute(task.scheduledDate, task.scheduledMinute)}`);
  }
  if (task.dueDate) labels.push(`Due ${formatDateAndMinute(task.dueDate, task.dueMinute)}`);
  return labels.join(' · ') || 'No scheduled or due date';
}

function minimumFutureTaskPoint(
  task: Task,
  selectedDate: string,
): { date: string; minute: number } | null {
  const points = [
    task.scheduledDate
      ? { date: task.scheduledDate, minute: minuteOrEnd(task.scheduledMinute) }
      : null,
    task.dueDate ? { date: task.dueDate, minute: minuteOrEnd(task.dueMinute) } : null,
  ].filter((value): value is { date: string; minute: number } => Boolean(value));
  const future = points.filter((point) => point.date > selectedDate);
  future.sort(
    (first, second) => first.date.localeCompare(second.date) || first.minute - second.minute,
  );
  return future[0] ?? null;
}

function taskAgendaItem(
  task: Task,
  selectedDate: string,
  contextNames: ReadonlyMap<string, string>,
  noticeTitles: ReadonlyMap<string, string>,
): AgendaItem | null {
  if (task.status === 'completed' || task.status === 'cancelled') return null;

  const base = {
    id: `task:${task.id}`,
    sourceType: 'task' as const,
    sourceId: task.id,
    title: task.title,
    sourceLabel: task.linkedEntityType === 'learner-notice' ? 'Follow-up Task' : 'Task',
    timingLabel: taskTimingLabel(task),
    detailLabel:
      task.linkedEntityType === 'learner-notice' && task.linkedEntityId
        ? `From learner notice: ${noticeTitles.get(task.linkedEntityId) ?? 'Unavailable learner notice'}`
        : task.notes,
    contextName: task.contextId ? contextNames.get(task.contextId) : undefined,
    href: '#/tasks',
    taskStatus: task.status,
  };

  if (task.status === 'waiting') {
    return {
      ...base,
      section: 'waiting',
      sortDate: task.updatedAt,
      sortMinute: task.order,
    };
  }

  if (task.dueDate && task.dueDate < selectedDate) {
    return {
      ...base,
      section: 'overdue',
      sortDate: task.dueDate,
      sortMinute: minuteOrEnd(task.dueMinute),
    };
  }

  if (task.scheduledDate === selectedDate || task.dueDate === selectedDate) {
    const minutes = [
      task.scheduledDate === selectedDate ? minuteOrEnd(task.scheduledMinute) : null,
      task.dueDate === selectedDate ? minuteOrEnd(task.dueMinute) : null,
    ].filter((value): value is number => value !== null);
    return {
      ...base,
      section: 'today',
      sortDate: selectedDate,
      sortMinute: Math.min(...minutes),
    };
  }

  const future = minimumFutureTaskPoint(task, selectedDate);
  if (future) {
    return {
      ...base,
      section: 'upcoming',
      sortDate: future.date,
      sortMinute: future.minute,
    };
  }

  if (
    task.linkedEntityType === 'learner-notice' &&
    task.linkedEntityId &&
    !task.scheduledDate &&
    !task.dueDate
  ) {
    return {
      ...base,
      section: 'unscheduled-follow-up',
      sortDate: task.updatedAt,
      sortMinute: task.order,
    };
  }

  return null;
}

function reminderAgendaItems(
  reminders: readonly Reminder[],
  snapshot: AgendaSourceSnapshot,
  selectedDate: string,
): AgendaItem[] {
  const active = reminders.filter((reminder) => reminder.status === 'active');
  return buildReminderListItems(active, snapshot).map((reminder) => {
    const section: AgendaSectionId =
      reminder.remindDate < selectedDate
        ? 'overdue'
        : reminder.remindDate === selectedDate
          ? 'today'
          : 'upcoming';
    return {
      id: `reminder:${reminder.id}`,
      sourceType: 'reminder',
      sourceId: reminder.id,
      title: reminder.sourceTitle,
      sourceLabel: `${reminder.sourceTypeLabel} reminder`,
      timingLabel: `Remind ${formatDateAndMinute(reminder.remindDate, reminder.remindMinute)}`,
      detailLabel: reminder.note,
      href: reminder.sourceHref ?? '#/today',
      section,
      sortDate: reminder.remindDate,
      sortMinute: reminder.remindMinute,
      remindDate: reminder.remindDate,
      remindMinute: reminder.remindMinute,
      reminderNote: reminder.note,
    };
  });
}

function eventAgendaItem(event: CalendarEvent, selectedDate: string): AgendaItem | null {
  if (!isPersonalCalendarEvent(event)) return null;
  const endDate = event.endDate ?? event.startDate;
  if (endDate < selectedDate) return null;
  const section: AgendaSectionId = event.startDate <= selectedDate ? 'today' : 'upcoming';
  const date = section === 'today' ? selectedDate : event.startDate;
  return {
    id: `calendar-event:${event.id}`,
    sourceType: 'calendar-event',
    sourceId: event.id,
    title: event.title,
    sourceLabel: 'Personal event',
    timingLabel:
      event.startDate === endDate
        ? formatDateAndMinute(event.startDate, event.startMinute)
        : `${formatShortDate(event.startDate)}–${formatShortDate(endDate)}`,
    detailLabel: event.details,
    href: `#/calendar?date=${encodeURIComponent(date)}`,
    section,
    sortDate: date,
    sortMinute: minuteOrEnd(event.startMinute),
  };
}

function noticeAgendaItem(
  notice: LearnerNotice,
  selectedDate: string,
  contextNames: ReadonlyMap<string, string>,
): AgendaItem | null {
  if (notice.status !== 'active') return null;

  let section: AgendaSectionId;
  let sortDate: string;
  if (notice.kind !== 'date-specific-notice') {
    section = 'today';
    sortDate = selectedDate;
  } else if (notice.noticeDate && notice.noticeDate < selectedDate) {
    section = 'overdue';
    sortDate = notice.noticeDate;
  } else if (notice.noticeDate === selectedDate) {
    section = 'today';
    sortDate = selectedDate;
  } else if (notice.noticeDate && notice.noticeDate > selectedDate) {
    section = 'upcoming';
    sortDate = notice.noticeDate;
  } else {
    return null;
  }

  return {
    id: `learner-notice:${notice.id}`,
    sourceType: 'learner-notice',
    sourceId: notice.id,
    title: notice.title,
    sourceLabel: learnerNoticeKindLabel(notice.kind),
    timingLabel: notice.noticeDate ? `Notice date ${formatShortDate(notice.noticeDate)}` : 'Active',
    detailLabel: notice.details,
    contextName: contextNames.get(notice.contextId) ?? 'Unavailable learner context',
    href: `#/learners?context=${encodeURIComponent(notice.contextId)}&support=active`,
    section,
    sortDate,
    sortMinute: 1440,
  };
}

function compareItems(first: AgendaItem, second: AgendaItem): number {
  return (
    first.sortDate.localeCompare(second.sortDate) ||
    first.sortMinute - second.sortMinute ||
    first.sourceLabel.localeCompare(second.sourceLabel) ||
    first.title.localeCompare(second.title) ||
    first.id.localeCompare(second.id)
  );
}

export function buildAgendaReadModel(
  values: AgendaSourceSnapshot,
  selectedDate: string,
): AgendaReadModel {
  const snapshot: AgendaSourceSnapshot = {
    tasks: values.tasks.map((value) => taskSchema.parse(value)),
    reminders: values.reminders.map((value) => reminderSchema.parse(value)),
    calendarEvents: values.calendarEvents.map((value) => calendarEventSchema.parse(value)),
    learnerNotices: values.learnerNotices.map((value) => learnerNoticeSchema.parse(value)),
    learnerContexts: values.learnerContexts.map((value) => learnerContextSchema.parse(value)),
    sessions: values.sessions.map((value) => sessionOccurrenceSchema.parse(value)),
    lessonPlans: values.lessonPlans.map((value) => lessonPlanSchema.parse(value)),
  };
  const contextNames = new Map(
    snapshot.learnerContexts.map((context) => [context.id, context.name] as const),
  );
  const noticeTitles = new Map(
    snapshot.learnerNotices.map((notice) => [notice.id, notice.title] as const),
  );

  const items: AgendaItem[] = [];
  for (const task of snapshot.tasks) {
    const item = taskAgendaItem(task, selectedDate, contextNames, noticeTitles);
    if (item) items.push(item);
  }
  items.push(...reminderAgendaItems(snapshot.reminders, snapshot, selectedDate));
  for (const event of snapshot.calendarEvents) {
    const item = eventAgendaItem(event, selectedDate);
    if (item) items.push(item);
  }
  for (const notice of snapshot.learnerNotices) {
    const item = noticeAgendaItem(notice, selectedDate, contextNames);
    if (item) items.push(item);
  }

  const sectionIds: AgendaSectionId[] = [
    'overdue',
    'today',
    'upcoming',
    'waiting',
    'unscheduled-follow-up',
  ];
  const sections = sectionIds.map((id): AgendaSection => ({
    id,
    ...sectionMetadata[id],
    items: items.filter((item) => item.section === id).sort(compareItems),
  }));
  const count = (id: AgendaSectionId) =>
    sections.find((section) => section.id === id)!.items.length;
  const summary: AgendaSummary = {
    overdue: count('overdue'),
    today: count('today'),
    upcoming: count('upcoming'),
    waiting: count('waiting'),
    unscheduledFollowUp: count('unscheduled-follow-up'),
    total: items.length,
  };

  return { selectedDate, sections, summary };
}
