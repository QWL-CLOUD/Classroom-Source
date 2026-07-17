import { z } from 'zod';

import type { ScheduleBlock, ScheduleException } from '@/domain/models/entities';
import { minuteToTime, timeToMinute } from '@/features/editing/scheduleBlockEditorModel';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type ScheduleEditScope = 'occurrence' | 'future' | 'default';

export interface ScheduleExceptionEditorValues {
  title: string;
  startTime: string;
  endTime: string;
  reason: string;
  scope: ScheduleEditScope;
}

export const scheduleExceptionEditorValuesSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title.'),
    startTime: z.string(),
    endTime: z.string(),
    reason: z.string().trim(),
    scope: z.enum(['occurrence', 'future', 'default']),
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
  });

export interface ParsedScheduleExceptionEditorValues {
  title: string;
  startMinute: number;
  endMinute: number;
  reason?: string;
  scope: ScheduleEditScope;
}

export function parseScheduleExceptionEditorValues(
  input: ScheduleExceptionEditorValues,
): ParsedScheduleExceptionEditorValues {
  const values = scheduleExceptionEditorValuesSchema.parse(input);
  return {
    title: values.title,
    startMinute: timeToMinute(values.startTime),
    endMinute: timeToMinute(values.endTime),
    reason: values.reason || undefined,
    scope: values.scope,
  };
}

export function createScheduleExceptionEditorValues(
  block: ScheduleBlock,
  exception?: ScheduleException,
): ScheduleExceptionEditorValues {
  return {
    title: exception?.replacementTitle?.trim() || block.title,
    startTime: minuteToTime(exception?.replacementStartMinute ?? block.startMinute),
    endTime: minuteToTime(exception?.replacementEndMinute ?? block.endMinute),
    reason: exception?.reason ?? '',
    scope: 'occurrence',
  };
}
