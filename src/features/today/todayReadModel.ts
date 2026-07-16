import { getISODay } from 'date-fns';

import type { CalendarEvent, ScheduleBlock } from '@/domain/models/entities';
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import { formatLongDate, parseLocalDate, todayLocalDate } from '@/shared/dates/localDate';

export type TodayItemSource = 'calendar-event' | 'schedule-block';
export type TodaySpanPosition = 'single' | 'start' | 'middle' | 'end';
export type TodayTemporalStatus = 'all-day' | 'past' | 'now' | 'upcoming';
export type TodayFocusLabel = 'All day' | 'First item' | 'Next' | 'Now';

export interface TodayTimelineItem {
  occurrenceId: string;
  sourceRecordId: string;
  sourceType: TodayItemSource;
  title: string;
  category: string;
  contextId?: string;
  date: string;
  timeLabel: string;
  isAllDay: boolean;
  startMinute?: number;
  endMinute?: number;
  kind?: ScheduleBlock['kind'];
  parentTitle?: string;
  spanPosition: TodaySpanPosition;
  sortOrder: number;
  temporalStatus: TodayTemporalStatus;
  statusLabel: string;
}

export interface TodayReminderItem {
  occurrenceId: string;
  sourceRecordId: string;
  title: string;
  category: string;
  timeLabel: string;
  spanPosition: TodaySpanPosition;
}

export interface TodayReadModel {
  date: string;
  label: string;
  isToday: boolean;
  isPastDate: boolean;
  isFutureDate: boolean;
  timelineItems: TodayTimelineItem[];
  reminderItems: TodayReminderItem[];
  focusItem: TodayTimelineItem | null;
  focusLabel: TodayFocusLabel | null;
  sourceScheduleBlockCount: number;
  sourceCalendarEventCount: number;
  visibleItemCount: number;
  hiddenDuplicateCount: number;
}

type TodayItemDraft = Omit<TodayTimelineItem, 'statusLabel' | 'temporalStatus'>;

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

function getEventSpanPosition(event: CalendarEvent, date: string): TodaySpanPosition {
  const endDate = getCalendarEventEndDate(event);
  if (event.startDate === endDate) return 'single';
  if (date === event.startDate) return 'start';
  if (date === endDate) return 'end';
  return 'middle';
}

function getEventTimeLabel(event: CalendarEvent, spanPosition: TodaySpanPosition): string {
  const hasStart = event.startMinute !== undefined;
  const hasEnd = event.endMinute !== undefined;

  if (!hasStart && !hasEnd) return 'All day';

  if (spanPosition === 'single') {
    if (hasStart && hasEnd) {
      return formatMinuteRange(event.startMinute!, event.endMinute!);
    }
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
): TodayItemDraft {
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

function toCalendarEventItem(event: CalendarEvent, date: string): TodayItemDraft {
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

function duplicateSignature(item: TodayItemDraft): string | null {
  if (item.isAllDay || item.spanPosition !== 'single') return null;
  if (item.startMinute === undefined || item.endMinute === undefined) {
    return null;
  }

  return [
    normalizeText(item.title),
    normalizeText(item.category),
    item.startMinute,
    item.endMinute,
    normalizeText(item.contextId),
  ].join('|');
}

function removeExactDatedDuplicates(items: readonly TodayItemDraft[]): {
  items: TodayItemDraft[];
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
    if (item.sourceType !== 'schedule-block' || item.kind === 'container') {
      return true;
    }

    const signature = duplicateSignature(item);
    if (!signature || !datedEventSignatures.has(signature)) return true;
    hiddenDuplicateCount += 1;
    return false;
  });

  return { items: deduplicated, hiddenDuplicateCount };
}

function compareTodayItems(first: TodayItemDraft, second: TodayItemDraft): number {
  const firstAllDayRank = first.isAllDay ? 0 : 1;
  const secondAllDayRank = second.isAllDay ? 0 : 1;
  if (firstAllDayRank !== secondAllDayRank) {
    return firstAllDayRank - secondAllDayRank;
  }

  const firstMinute = first.startMinute ?? -1;
  const secondMinute = second.startMinute ?? -1;
  if (firstMinute !== secondMinute) return firstMinute - secondMinute;

  const firstContainerRank = first.kind === 'container' ? 0 : 1;
  const secondContainerRank = second.kind === 'container' ? 0 : 1;
  if (firstContainerRank !== secondContainerRank) {
    return firstContainerRank - secondContainerRank;
  }

  if (first.sortOrder !== second.sortOrder) {
    return first.sortOrder - second.sortOrder;
  }

  const firstSourceRank = first.sourceType === 'calendar-event' ? 0 : 1;
  const secondSourceRank = second.sourceType === 'calendar-event' ? 0 : 1;
  if (firstSourceRank !== secondSourceRank) {
    return firstSourceRank - secondSourceRank;
  }

  const titleComparison = first.title.localeCompare(second.title);
  if (titleComparison !== 0) return titleComparison;
  return first.occurrenceId.localeCompare(second.occurrenceId);
}

function classifyTemporalStatus(
  item: TodayItemDraft,
  selectedDate: string,
  currentDate: string,
  currentMinute: number,
): TodayTemporalStatus {
  if (item.isAllDay) return 'all-day';
  if (selectedDate < currentDate) return 'past';
  if (selectedDate > currentDate) return 'upcoming';

  if (item.spanPosition === 'middle') return 'now';

  if (item.spanPosition === 'start') {
    if (item.startMinute !== undefined && currentMinute < item.startMinute) {
      return 'upcoming';
    }
    return 'now';
  }

  if (item.spanPosition === 'end') {
    if (item.endMinute !== undefined && currentMinute >= item.endMinute) {
      return 'past';
    }
    return 'now';
  }

  if (item.startMinute !== undefined && currentMinute < item.startMinute) {
    return 'upcoming';
  }

  if (item.endMinute !== undefined && currentMinute >= item.endMinute) {
    return 'past';
  }

  return 'now';
}

function getStatusLabel(status: TodayTemporalStatus): string {
  if (status === 'all-day') return 'All day';
  if (status === 'past') return 'Past';
  if (status === 'now') return 'Now';
  return 'Upcoming';
}

function chooseFocusItem(
  items: readonly TodayTimelineItem[],
  selectedDate: string,
  currentDate: string,
): { item: TodayTimelineItem | null; label: TodayFocusLabel | null } {
  if (selectedDate < currentDate) return { item: null, label: null };

  const actionableItems = items.filter((item) => item.kind !== 'container');
  const candidates = actionableItems.length > 0 ? actionableItems : items;

  if (selectedDate > currentDate) {
    const firstTimed = candidates.find((item) => !item.isAllDay);
    const firstItem = firstTimed ?? candidates[0] ?? null;
    return {
      item: firstItem,
      label: firstItem ? (firstItem.isAllDay ? 'All day' : 'First item') : null,
    };
  }

  const currentItem = candidates.find((item) => item.temporalStatus === 'now');
  if (currentItem) return { item: currentItem, label: 'Now' };

  const nextItem = candidates.find((item) => item.temporalStatus === 'upcoming');
  if (nextItem) return { item: nextItem, label: 'Next' };

  const allDayItem = candidates.find((item) => item.isAllDay);
  return {
    item: allDayItem ?? null,
    label: allDayItem ? 'All day' : null,
  };
}

function toReminderItem(item: TodayItemDraft): TodayReminderItem {
  return {
    occurrenceId: item.occurrenceId,
    sourceRecordId: item.sourceRecordId,
    title: item.title,
    category: item.category,
    timeLabel: item.timeLabel,
    spanPosition: item.spanPosition,
  };
}

export function buildTodayReadModel(
  selectedDate: string,
  scheduleBlocks: readonly ScheduleBlock[],
  calendarEvents: readonly CalendarEvent[],
  currentDate: string = todayLocalDate(),
  currentMinute: number = new Date().getHours() * 60 + new Date().getMinutes(),
): TodayReadModel {
  requireLocalDate(selectedDate);
  requireLocalDate(currentDate);

  const blockById = new Map(scheduleBlocks.map((block) => [block.id, block]));
  const visibleScheduleBlocks = scheduleBlocks.filter((block) =>
    scheduleBlockOccursOnDate(block, selectedDate),
  );
  const visibleCalendarEvents = calendarEvents.filter((event) =>
    calendarEventOccursOnDate(event, selectedDate),
  );

  const scheduleItems = visibleScheduleBlocks.map((block) =>
    toScheduleItem(block, selectedDate, blockById),
  );
  const eventItems = visibleCalendarEvents.map((event) => toCalendarEventItem(event, selectedDate));
  const deduplicated = removeExactDatedDuplicates([...scheduleItems, ...eventItems]);

  const timelineItems = deduplicated.items
    .sort(compareTodayItems)
    .map((item): TodayTimelineItem => {
      const temporalStatus = classifyTemporalStatus(item, selectedDate, currentDate, currentMinute);
      return {
        ...item,
        temporalStatus,
        statusLabel: getStatusLabel(temporalStatus),
      };
    });

  const reminderItems = eventItems.slice().sort(compareTodayItems).map(toReminderItem);
  const focus = chooseFocusItem(timelineItems, selectedDate, currentDate);

  return {
    date: selectedDate,
    label: formatLongDate(selectedDate),
    isToday: selectedDate === currentDate,
    isPastDate: selectedDate < currentDate,
    isFutureDate: selectedDate > currentDate,
    timelineItems,
    reminderItems,
    focusItem: focus.item,
    focusLabel: focus.label,
    sourceScheduleBlockCount: visibleScheduleBlocks.length,
    sourceCalendarEventCount: visibleCalendarEvents.length,
    visibleItemCount: timelineItems.length,
    hiddenDuplicateCount: deduplicated.hiddenDuplicateCount,
  };
}
