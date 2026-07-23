import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import type {
  CalendarEvent,
  LessonPlan,
  ScheduleBlock,
  ScheduleException,
  SessionOccurrence,
} from '@/domain/models/entities';
import {
  formatLongDate,
  parseLocalDate,
  toLocalDateString,
  todayLocalDate,
} from '@/shared/dates/localDate';
import { resolveScheduleOccurrence } from '@/features/scheduleExceptions/scheduleOccurrenceResolver';
import {
  scheduleOccurrenceIsVisibleForSchoolYear,
  type SchoolYearScheduleBoundary,
} from '@/features/schoolYears/schoolYearScheduleBoundary';

export const CALENDAR_WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export interface CalendarMonthRange {
  anchorDate: string;
  monthStartDate: string;
  monthEndDate: string;
  gridStartDate: string;
  gridEndDate: string;
  label: string;
  dates: string[];
}

export type CalendarItemSource = 'calendar-event' | 'schedule-block' | 'session-occurrence';
export type CalendarSpanPosition = 'single' | 'start' | 'middle' | 'end';

export interface CalendarDayItem {
  occurrenceId: string;
  sourceRecordId: string;
  sourceType: CalendarItemSource;
  title: string;
  category: string;
  date: string;
  timeLabel: string;
  isAllDay: boolean;
  startMinute?: number;
  endMinute?: number;
  kind?: ScheduleBlock['kind'];
  scheduleExceptionAction?: Exclude<ScheduleException['action'], 'cancel'>;
  parentTitle?: string;
  deliveryState?: SessionOccurrence['deliveryState'];
  spanPosition: CalendarSpanPosition;
  sortOrder: number;
}

export interface CalendarDayReadModel {
  date: string;
  label: string;
  weekdayLabel: string;
  dayNumber: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  items: CalendarDayItem[];
}

export interface CalendarMonthReadModel {
  range: CalendarMonthRange;
  days: CalendarDayReadModel[];
  sourceScheduleBlockCount: number;
  sourceCalendarEventCount: number;
  sourceSessionOccurrenceCount: number;
  visibleItemCount: number;
}

function requireLocalDate(value: string): Date {
  const parsed = parseLocalDate(value);
  if (!parsed) throw new Error(`Invalid local date: ${value}`);
  return parsed;
}

export function getCalendarMonthRange(anchorDate: string): CalendarMonthRange {
  const anchor = requireLocalDate(anchorDate);
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  return {
    anchorDate,
    monthStartDate: toLocalDateString(monthStart),
    monthEndDate: toLocalDateString(monthEnd),
    gridStartDate: toLocalDateString(gridStart),
    gridEndDate: toLocalDateString(gridEnd),
    label: format(anchor, 'MMMM yyyy'),
    dates: eachDayOfInterval({ start: gridStart, end: gridEnd }).map(toLocalDateString),
  };
}

export function shiftCalendarMonth(anchorDate: string, amount: number): string {
  const anchor = requireLocalDate(anchorDate);
  return toLocalDateString(startOfMonth(addMonths(anchor, amount)));
}

export function formatCalendarMinute(minute: number): string {
  const hour24 = Math.floor(minute / 60);
  const minutes = minute % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${suffix}`;
}

function formatMinuteRange(startMinute: number, endMinute: number): string {
  return `${formatCalendarMinute(startMinute)}–${formatCalendarMinute(endMinute)}`;
}

function getCalendarEventEndDate(event: CalendarEvent): string {
  if (!event.endDate || event.endDate < event.startDate) return event.startDate;
  return event.endDate;
}

function getEventSpanPosition(event: CalendarEvent, date: string): CalendarSpanPosition {
  const endDate = getCalendarEventEndDate(event);
  if (event.startDate === endDate) return 'single';
  if (date === event.startDate) return 'start';
  if (date === endDate) return 'end';
  return 'middle';
}

function getEventTimeLabel(event: CalendarEvent, spanPosition: CalendarSpanPosition): string {
  const hasStart = event.startMinute !== undefined;
  const hasEnd = event.endMinute !== undefined;

  if (!hasStart && !hasEnd) return 'All day';

  if (spanPosition === 'single') {
    if (hasStart && hasEnd) return formatMinuteRange(event.startMinute!, event.endMinute!);
    if (hasStart) return formatCalendarMinute(event.startMinute!);
    return `Until ${formatCalendarMinute(event.endMinute!)}`;
  }

  if (spanPosition === 'start') {
    return hasStart ? `Starts ${formatCalendarMinute(event.startMinute!)}` : 'Starts';
  }

  if (spanPosition === 'end') {
    return hasEnd ? `Ends ${formatCalendarMinute(event.endMinute!)}` : 'Ends';
  }

  return 'Continues';
}

function calendarEventOccursOnDate(event: CalendarEvent, date: string): boolean {
  return event.startDate <= date && date <= getCalendarEventEndDate(event);
}

function toScheduleItem(
  block: ScheduleBlock,
  date: string,
  blockById: ReadonlyMap<string, ScheduleBlock>,
  scheduleExceptionAction?: Exclude<ScheduleException['action'], 'cancel'>,
): CalendarDayItem {
  const parent = block.parentId ? blockById.get(block.parentId) : undefined;

  return {
    occurrenceId: `schedule-block:${block.id}:${date}`,
    sourceRecordId: block.id,
    sourceType: 'schedule-block',
    title: block.title,
    category: block.category,
    date,
    timeLabel: formatMinuteRange(block.startMinute, block.endMinute),
    isAllDay: false,
    startMinute: block.startMinute,
    endMinute: block.endMinute,
    kind: block.kind,
    scheduleExceptionAction,
    parentTitle: parent?.title,
    spanPosition: 'single',
    sortOrder: block.sortOrder,
  };
}

function toCalendarEventItem(event: CalendarEvent, date: string): CalendarDayItem {
  const spanPosition = getEventSpanPosition(event, date);
  const isAllDay = event.startMinute === undefined && event.endMinute === undefined;

  return {
    occurrenceId: `calendar-event:${event.id}:${date}`,
    sourceRecordId: event.id,
    sourceType: 'calendar-event',
    title: event.title,
    category: event.category,
    date,
    timeLabel: getEventTimeLabel(event, spanPosition),
    isAllDay,
    startMinute: event.startMinute,
    endMinute: event.endMinute,
    spanPosition,
    sortOrder: 0,
  };
}

function toSessionItem(
  session: SessionOccurrence,
  lessonPlanById: ReadonlyMap<string, LessonPlan>,
): CalendarDayItem {
  const plan = lessonPlanById.get(session.lessonPlanId);
  return {
    occurrenceId: `session-occurrence:${session.id}`,
    sourceRecordId: session.id,
    sourceType: 'session-occurrence',
    title: plan?.title ?? 'Planned session',
    category: plan?.subject ?? 'Planning',
    date: session.date,
    timeLabel: formatMinuteRange(session.startMinute, session.endMinute),
    isAllDay: false,
    startMinute: session.startMinute,
    endMinute: session.endMinute,
    deliveryState: session.deliveryState,
    spanPosition: 'single',
    sortOrder: 0,
  };
}

function compareCalendarItems(first: CalendarDayItem, second: CalendarDayItem): number {
  const firstAllDayRank = first.isAllDay ? 0 : 1;
  const secondAllDayRank = second.isAllDay ? 0 : 1;
  if (firstAllDayRank !== secondAllDayRank) return firstAllDayRank - secondAllDayRank;

  const firstMinute = first.startMinute ?? -1;
  const secondMinute = second.startMinute ?? -1;
  if (firstMinute !== secondMinute) return firstMinute - secondMinute;

  const firstContainerRank = first.kind === 'container' ? 0 : 1;
  const secondContainerRank = second.kind === 'container' ? 0 : 1;
  if (firstContainerRank !== secondContainerRank) return firstContainerRank - secondContainerRank;

  if (first.sortOrder !== second.sortOrder) return first.sortOrder - second.sortOrder;

  const sourceRank: Record<CalendarItemSource, number> = {
    'calendar-event': 0,
    'session-occurrence': 1,
    'schedule-block': 2,
  };
  const sourceComparison = sourceRank[first.sourceType] - sourceRank[second.sourceType];
  if (sourceComparison !== 0) return sourceComparison;

  const titleComparison = first.title.localeCompare(second.title);
  if (titleComparison !== 0) return titleComparison;

  return first.occurrenceId.localeCompare(second.occurrenceId);
}

export function buildCalendarMonthReadModel(
  anchorDate: string,
  scheduleBlocks: readonly ScheduleBlock[],
  calendarEvents: readonly CalendarEvent[],
  currentDate: string = todayLocalDate(),
  scheduleExceptions: readonly ScheduleException[] = [],
  lessonPlans: readonly LessonPlan[] = [],
  sessionOccurrences: readonly SessionOccurrence[] = [],
  schoolYearBoundary?: SchoolYearScheduleBoundary | null,
): CalendarMonthReadModel {
  const range = getCalendarMonthRange(anchorDate);
  const blockById = new Map(scheduleBlocks.map((block) => [block.id, block]));
  const lessonPlanById = new Map(lessonPlans.map((plan) => [plan.id, plan]));
  const visibleScheduleBlockIds = new Set<string>();
  const visibleCalendarEventIds = new Set<string>();
  const visibleSessionOccurrenceIds = new Set<string>();

  const days = range.dates.map((date): CalendarDayReadModel => {
    const scheduleItems = scheduleBlocks
      .map((block) => resolveScheduleOccurrence(block, date, scheduleExceptions))
      .filter((occurrence) => occurrence !== null)
      .filter((occurrence) =>
        scheduleOccurrenceIsVisibleForSchoolYear(
          date,
          occurrence.exception?.action,
          schoolYearBoundary,
        ),
      )
      .map((occurrence) => {
        visibleScheduleBlockIds.add(occurrence.block.id);
        return toScheduleItem(
          occurrence.block,
          date,
          blockById,
          occurrence.exception?.action === 'modify' || occurrence.exception?.action === 'add'
            ? occurrence.exception.action
            : undefined,
        );
      });

    const eventItems = calendarEvents
      .filter((event) => calendarEventOccursOnDate(event, date))
      .map((event) => {
        visibleCalendarEventIds.add(event.id);
        return toCalendarEventItem(event, date);
      });

    const sessionItems = sessionOccurrences
      .filter((session) => session.date === date && session.deliveryState !== 'cancelled')
      .map((session) => {
        visibleSessionOccurrenceIds.add(session.id);
        return toSessionItem(session, lessonPlanById);
      });

    const parsed = requireLocalDate(date);

    return {
      date,
      label: formatLongDate(date),
      weekdayLabel: format(parsed, 'EEE'),
      dayNumber: format(parsed, 'd'),
      inCurrentMonth: date >= range.monthStartDate && date <= range.monthEndDate,
      isToday: date === currentDate,
      items: [...scheduleItems, ...eventItems, ...sessionItems].sort(compareCalendarItems),
    };
  });

  return {
    range,
    days,
    sourceScheduleBlockCount: visibleScheduleBlockIds.size,
    sourceCalendarEventCount: visibleCalendarEventIds.size,
    sourceSessionOccurrenceCount: visibleSessionOccurrenceIds.size,
    visibleItemCount: days.reduce((total, day) => total + day.items.length, 0),
  };
}
