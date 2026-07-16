import { format, getISODay } from 'date-fns';

import type {
  CalendarEvent,
  LessonPlan,
  ScheduleBlock,
  SessionOccurrence,
} from '@/domain/models/entities';
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import {
  formatLongDate,
  getMonday,
  getWeekDates,
  parseLocalDate,
  shiftDays,
  todayLocalDate,
} from '@/shared/dates/localDate';

export type WeekViewFilter = 'teaching' | 'calendar' | 'personal' | 'everything';
export type WeekItemSource = 'calendar-event' | 'schedule-block' | 'session-occurrence';
export type WeekSpanPosition = 'single' | 'start' | 'middle' | 'end';

export interface WeekRange {
  anchorDate: string;
  mondayDate: string;
  sundayDate: string;
  label: string;
  ariaLabel: string;
  dates: string[];
}

export interface WeekDayItem {
  occurrenceId: string;
  sourceRecordId: string;
  sourceType: WeekItemSource;
  title: string;
  category: string;
  contextId?: string;
  date: string;
  timeLabel: string;
  isAllDay: boolean;
  startMinute?: number;
  endMinute?: number;
  kind?: ScheduleBlock['kind'];
  deliveryState?: SessionOccurrence['deliveryState'];
  parentTitle?: string;
  spanPosition: WeekSpanPosition;
  sortOrder: number;
}

export interface WeekDayReadModel {
  date: string;
  label: string;
  weekdayLabel: string;
  shortDateLabel: string;
  isToday: boolean;
  items: WeekDayItem[];
}

export interface WeekReadModel {
  range: WeekRange;
  days: WeekDayReadModel[];
  viewFilter: WeekViewFilter;
  sourceScheduleBlockCount: number;
  sourceCalendarEventCount: number;
  sourceSessionOccurrenceCount: number;
  visibleItemCount: number;
  hiddenDuplicateCount: number;
}

function requireLocalDate(value: string): Date {
  const parsed = parseLocalDate(value);
  if (!parsed) throw new Error(`Invalid local date: ${value}`);
  return parsed;
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

function formatMinuteRange(startMinute: number, endMinute: number): string {
  return `${formatCalendarMinute(startMinute)}–${formatCalendarMinute(endMinute)}`;
}

function getCalendarEventEndDate(event: CalendarEvent): string {
  if (!event.endDate || event.endDate < event.startDate) return event.startDate;
  return event.endDate;
}

function getEventSpanPosition(event: CalendarEvent, date: string): WeekSpanPosition {
  const endDate = getCalendarEventEndDate(event);
  if (event.startDate === endDate) return 'single';
  if (date === event.startDate) return 'start';
  if (date === endDate) return 'end';
  return 'middle';
}

function getEventTimeLabel(event: CalendarEvent, spanPosition: WeekSpanPosition): string {
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

function scheduleBlockOccursOnDate(block: ScheduleBlock, date: string): boolean {
  if (!block.showInWeek) return false;
  if (block.effectiveFrom && date < block.effectiveFrom) return false;
  if (block.effectiveTo && date > block.effectiveTo) return false;
  if (block.effectiveFrom && block.effectiveTo && block.effectiveFrom > block.effectiveTo) {
    return false;
  }

  return block.weekdays.includes(getISODay(requireLocalDate(date)));
}

function calendarEventOccursOnDate(event: CalendarEvent, date: string): boolean {
  return event.startDate <= date && date <= getCalendarEventEndDate(event);
}

function toScheduleItem(
  block: ScheduleBlock,
  date: string,
  blockById: ReadonlyMap<string, ScheduleBlock>,
): WeekDayItem {
  const parent = block.parentId ? blockById.get(block.parentId) : undefined;

  return {
    occurrenceId: `schedule-block:${block.id}:${date}`,
    sourceRecordId: block.id,
    sourceType: 'schedule-block',
    title: block.title,
    category: block.category,
    contextId: block.contextId,
    date,
    timeLabel: formatMinuteRange(block.startMinute, block.endMinute),
    isAllDay: false,
    startMinute: block.startMinute,
    endMinute: block.endMinute,
    kind: block.kind,
    parentTitle: parent?.title,
    spanPosition: 'single',
    sortOrder: block.sortOrder,
  };
}

function toCalendarEventItem(event: CalendarEvent, date: string): WeekDayItem {
  const spanPosition = getEventSpanPosition(event, date);
  const isAllDay = event.startMinute === undefined && event.endMinute === undefined;

  return {
    occurrenceId: `calendar-event:${event.id}:${date}`,
    sourceRecordId: event.id,
    sourceType: 'calendar-event',
    title: event.title,
    category: event.category,
    contextId: event.contextId,
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
): WeekDayItem {
  const plan = lessonPlanById.get(session.lessonPlanId);

  return {
    occurrenceId: `session-occurrence:${session.id}`,
    sourceRecordId: session.id,
    sourceType: 'session-occurrence',
    title: plan?.title ?? 'Planned session',
    category: plan?.subject ?? 'Planning',
    contextId: session.contextId,
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

function isPersonalCalendarItem(item: WeekDayItem): boolean {
  if (item.sourceType !== 'calendar-event') return false;
  const classification = `${normalizeText(item.category)} ${normalizeText(item.title)}`;
  return /(^|\s)(personal|private|home)(\s|$)/u.test(classification);
}

function itemMatchesView(item: WeekDayItem, viewFilter: WeekViewFilter): boolean {
  if (viewFilter === 'everything') return true;
  if (viewFilter === 'teaching') return item.sourceType === 'schedule-block';
  if (viewFilter === 'personal') return isPersonalCalendarItem(item);
  return item.sourceType === 'calendar-event' && !isPersonalCalendarItem(item);
}

function duplicateSignature(item: WeekDayItem): string | null {
  if (item.isAllDay || item.spanPosition !== 'single') return null;
  if (item.startMinute === undefined || item.endMinute === undefined) return null;

  return [
    normalizeText(item.title),
    normalizeText(item.category),
    item.startMinute,
    item.endMinute,
    normalizeText(item.contextId),
  ].join('|');
}

function removeExactDatedDuplicates(items: readonly WeekDayItem[]): {
  items: WeekDayItem[];
  hiddenDuplicateCount: number;
} {
  const datedEventSignatures = new Set(
    items
      .filter((item) => item.sourceType === 'calendar-event')
      .map(duplicateSignature)
      .filter((signature): signature is string => signature !== null),
  );

  let hiddenDuplicateCount = 0;
  const deduplicated = items.filter((item) => {
    if (item.sourceType !== 'schedule-block' || item.kind === 'container') return true;
    const signature = duplicateSignature(item);
    if (!signature || !datedEventSignatures.has(signature)) return true;
    hiddenDuplicateCount += 1;
    return false;
  });

  return { items: deduplicated, hiddenDuplicateCount };
}

function compareWeekItems(first: WeekDayItem, second: WeekDayItem): number {
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

  const sourceRank: Record<WeekItemSource, number> = {
    'calendar-event': 0,
    'session-occurrence': 1,
    'schedule-block': 2,
  };
  const firstSourceRank = sourceRank[first.sourceType];
  const secondSourceRank = sourceRank[second.sourceType];
  if (firstSourceRank !== secondSourceRank) return firstSourceRank - secondSourceRank;

  const titleComparison = first.title.localeCompare(second.title);
  if (titleComparison !== 0) return titleComparison;
  return first.occurrenceId.localeCompare(second.occurrenceId);
}

export function getWeekRange(anchorDate: string): WeekRange {
  const mondayDate = getMonday(anchorDate);
  const dates = getWeekDates(mondayDate);
  const sundayDate = dates[6]!;
  const monday = requireLocalDate(mondayDate);
  const sunday = requireLocalDate(sundayDate);

  return {
    anchorDate,
    mondayDate,
    sundayDate,
    label: `${format(monday, 'MMM d')} – ${format(sunday, 'MMM d')}`,
    ariaLabel: `Week of ${format(monday, 'MMMM d, yyyy')}`,
    dates,
  };
}

export function shiftWeek(anchorDate: string, amount: number): string {
  return shiftDays(getMonday(anchorDate), amount * 7);
}

export function buildWeekReadModel(
  anchorDate: string,
  scheduleBlocks: readonly ScheduleBlock[],
  calendarEvents: readonly CalendarEvent[],
  viewFilter: WeekViewFilter,
  currentDate: string = todayLocalDate(),
  lessonPlans: readonly LessonPlan[] = [],
  sessionOccurrences: readonly SessionOccurrence[] = [],
): WeekReadModel {
  const range = getWeekRange(anchorDate);
  const blockById = new Map(scheduleBlocks.map((block) => [block.id, block]));
  const lessonPlanById = new Map(lessonPlans.map((plan) => [plan.id, plan]));
  const visibleScheduleBlockIds = new Set<string>();
  const visibleCalendarEventIds = new Set<string>();
  const visibleSessionOccurrenceIds = new Set<string>();
  let hiddenDuplicateCount = 0;

  const days = range.dates.map((date): WeekDayReadModel => {
    const scheduleItems = scheduleBlocks
      .filter((block) => scheduleBlockOccursOnDate(block, date))
      .map((block) => {
        visibleScheduleBlockIds.add(block.id);
        return toScheduleItem(block, date, blockById);
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

    const filteredItems = [...scheduleItems, ...eventItems, ...sessionItems].filter((item) =>
      itemMatchesView(item, viewFilter),
    );
    const deduplicated = removeExactDatedDuplicates(filteredItems);
    hiddenDuplicateCount += deduplicated.hiddenDuplicateCount;

    const parsed = requireLocalDate(date);
    return {
      date,
      label: formatLongDate(date),
      weekdayLabel: format(parsed, 'EEEE'),
      shortDateLabel: format(parsed, 'MMM d'),
      isToday: date === currentDate,
      items: deduplicated.items.sort(compareWeekItems),
    };
  });

  return {
    range,
    days,
    viewFilter,
    sourceScheduleBlockCount: visibleScheduleBlockIds.size,
    sourceCalendarEventCount: visibleCalendarEventIds.size,
    sourceSessionOccurrenceCount: visibleSessionOccurrenceIds.size,
    visibleItemCount: days.reduce((total, day) => total + day.items.length, 0),
    hiddenDuplicateCount,
  };
}
