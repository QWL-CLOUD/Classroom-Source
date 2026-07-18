import { z } from 'zod';

import { scheduleBlockSchema, type ScheduleBlock } from '@/domain/models/entities';
import { parseLocalDate } from '@/shared/dates/localDate';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const SCHEDULE_BLOCK_KIND_OPTIONS: ReadonlyArray<{
  value: ScheduleBlock['kind'];
  label: string;
}> = [
  { value: 'container', label: 'Schedule group' },
  { value: 'teachable', label: 'Teachable block' },
  { value: 'routine', label: 'Routine' },
  { value: 'transition', label: 'Transition' },
];

export const SCHEDULE_BLOCK_WEEKDAYS = [
  { value: 1, label: 'Monday', shortLabel: 'Mon' },
  { value: 2, label: 'Tuesday', shortLabel: 'Tue' },
  { value: 3, label: 'Wednesday', shortLabel: 'Wed' },
  { value: 4, label: 'Thursday', shortLabel: 'Thu' },
  { value: 5, label: 'Friday', shortLabel: 'Fri' },
  { value: 6, label: 'Saturday', shortLabel: 'Sat' },
  { value: 7, label: 'Sunday', shortLabel: 'Sun' },
] as const;

export interface ScheduleBlockEditorValues {
  title: string;
  category: string;
  kind: ScheduleBlock['kind'];
  weekdays: number[];
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string;
  showInWeek: boolean;
  parentId: string;
}

export type ScheduleBlockEditableFields = Pick<
  ScheduleBlock,
  | 'title'
  | 'category'
  | 'kind'
  | 'weekdays'
  | 'startMinute'
  | 'endMinute'
  | 'effectiveFrom'
  | 'effectiveTo'
  | 'showInWeek'
  | 'parentId'
>;

export const scheduleBlockEditorValuesSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a schedule block title.'),
    category: z.string().trim().min(1, 'Enter a category.'),
    kind: z.enum(['container', 'teachable', 'routine', 'transition']),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Choose at least one weekday.')
      .transform((values) => [...new Set(values)].sort((left, right) => left - right)),
    startTime: z.string(),
    endTime: z.string(),
    effectiveFrom: z
      .string()
      .refine(
        (value) => value === '' || Boolean(parseLocalDate(value)),
        'Choose a valid effective start date.',
      ),
    effectiveTo: z
      .string()
      .refine(
        (value) => value === '' || Boolean(parseLocalDate(value)),
        'Choose a valid effective end date.',
      ),
    showInWeek: z.boolean(),
    parentId: z.string(),
  })
  .superRefine((values, context) => {
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
      timeToMinute(values.endTime) <= timeToMinute(values.startTime)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'End time must be after the start time.',
      });
    }

    if (values.effectiveFrom && values.effectiveTo && values.effectiveTo < values.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Effective end cannot be before the effective start.',
      });
    }
  });

export function timeToMinute(value: string): number {
  const [hourText, minuteText] = value.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

export function minuteToTime(value: number): string {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function parseScheduleBlockEditorValues(
  input: ScheduleBlockEditorValues,
): ScheduleBlockEditableFields {
  const values = scheduleBlockEditorValuesSchema.parse(input);
  const fields: ScheduleBlockEditableFields = {
    title: values.title,
    category: values.category,
    kind: values.kind,
    weekdays: values.weekdays,
    startMinute: timeToMinute(values.startTime),
    endMinute: timeToMinute(values.endTime),
    effectiveFrom: values.effectiveFrom || undefined,
    effectiveTo: values.effectiveTo || undefined,
    showInWeek: values.showInWeek,
    parentId: values.parentId.trim() || undefined,
  };

  scheduleBlockSchema.parse({
    id: 'schedule-block-editor-validation',
    subject: '',
    planningEnabled: false,
    bumpEnabled: false,
    sortOrder: 0,
    ...fields,
  });

  return fields;
}

export function toScheduleBlockEditorValues(block: ScheduleBlock): ScheduleBlockEditorValues {
  return {
    title: block.title,
    category: block.category,
    kind: block.kind,
    weekdays: [...block.weekdays].sort((left, right) => left - right),
    startTime: minuteToTime(block.startMinute),
    endTime: minuteToTime(block.endMinute),
    effectiveFrom: block.effectiveFrom ?? '',
    effectiveTo: block.effectiveTo ?? '',
    showInWeek: block.showInWeek,
    parentId: block.parentId ?? '',
  };
}

export function createScheduleBlockEditorValues(): ScheduleBlockEditorValues {
  return {
    title: '',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '10:00',
    effectiveFrom: '',
    effectiveTo: '',
    showInWeek: true,
    parentId: '',
  };
}
