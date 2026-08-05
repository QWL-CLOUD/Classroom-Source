import { z } from 'zod';

import { calendarEventSchema, type CalendarEvent } from '@/domain/models/entities';
import { parseLocalDate } from '@/shared/dates/localDate';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface CalendarEventEditorValues {
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  schoolYearId: string;
  categoryValueId: string;
  category: string;
  details: string;
  location: string;
  timeZone: string;
}

export type CalendarEventEditableFields = Pick<
  CalendarEvent,
  | 'title'
  | 'startDate'
  | 'endDate'
  | 'startMinute'
  | 'endMinute'
  | 'schoolYearId'
  | 'category'
  | 'details'
  | 'location'
  | 'timeZone'
>;

export interface ParsedCalendarEventEditorValues {
  fields: CalendarEventEditableFields;
  categoryValueId?: string;
}

export const calendarEventEditorValuesSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter an event title.').max(500),
    startDate: z
      .string()
      .refine((value) => Boolean(parseLocalDate(value)), 'Choose a valid start date.'),
    endDate: z
      .string()
      .refine(
        (value) => value === '' || Boolean(parseLocalDate(value)),
        'Choose a valid end date.',
      ),
    allDay: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    schoolYearId: z.string(),
    categoryValueId: z.string(),
    category: z.string().trim().min(1, 'Enter a category.').max(120),
    details: z.string().max(10_000),
    location: z.string().max(1000),
    timeZone: z.string().max(200),
  })
  .superRefine((values, context) => {
    const endDate = values.endDate || values.startDate;
    if (endDate < values.startDate) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'End date cannot be before the start date.',
      });
    }

    if (values.allDay) return;

    if (!timePattern.test(values.startTime)) {
      context.addIssue({
        code: 'custom',
        path: ['startTime'],
        message: 'Choose a valid start time.',
      });
    }

    if (!timePattern.test(values.endTime)) {
      context.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'Choose a valid end time.',
      });
    }

    if (
      timePattern.test(values.startTime) &&
      timePattern.test(values.endTime) &&
      endDate === values.startDate &&
      timeToMinute(values.endTime) <= timeToMinute(values.startTime)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'End time must be after the start time on the same date.',
      });
    }
  });

export function timeToMinute(value: string): number {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return hour * 60 + minute;
}

export function minuteToTime(value: number | undefined): string {
  if (value === undefined) return '';
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function parseCalendarEventEditorValues(
  input: CalendarEventEditorValues,
): ParsedCalendarEventEditorValues {
  const values = calendarEventEditorValuesSchema.parse(input);
  const fields: CalendarEventEditableFields = {
    title: values.title,
    startDate: values.startDate,
    endDate: values.endDate || undefined,
    startMinute: values.allDay ? undefined : timeToMinute(values.startTime),
    endMinute: values.allDay ? undefined : timeToMinute(values.endTime),
    schoolYearId: values.schoolYearId || undefined,
    category: values.category,
    details: values.details.trim() || undefined,
    location: values.location.trim() || undefined,
    timeZone: values.timeZone.trim() || undefined,
  };

  calendarEventSchema.parse({
    id: 'calendar-event-editor-validation',
    ...fields,
  });
  return {
    fields,
    categoryValueId: values.categoryValueId || undefined,
  };
}

export function toCalendarEventEditorValues(
  event: CalendarEvent,
  categoryValueId = '',
): CalendarEventEditorValues {
  const allDay = event.startMinute === undefined && event.endMinute === undefined;
  return {
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate ?? '',
    allDay,
    startTime: minuteToTime(event.startMinute),
    endTime: minuteToTime(event.endMinute),
    schoolYearId: event.schoolYearId ?? '',
    categoryValueId,
    category: event.category,
    details: event.details ?? '',
    location: event.location ?? '',
    timeZone: event.timeZone ?? '',
  };
}

export function createCalendarEventEditorValues(
  startDate: string,
  schoolYearId = '',
  categoryValueId = '',
): CalendarEventEditorValues {
  return {
    title: '',
    startDate,
    endDate: '',
    allDay: true,
    startTime: '09:00',
    endTime: '10:00',
    schoolYearId,
    categoryValueId,
    category: 'Calendar',
    details: '',
    location: '',
    timeZone: '',
  };
}
