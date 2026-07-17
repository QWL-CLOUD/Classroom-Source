import { z } from 'zod';

import {
  lessonPlanSchema,
  sessionOccurrenceSchema,
  type LessonPlan,
  type SessionOccurrence,
} from '@/domain/models/entities';
import { minuteToTime, timeToMinute } from '@/features/editing/calendarEventEditorModel';
import { parseLocalDate } from '@/shared/dates/localDate';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface LessonPlanEditorValues {
  title: string;
  subject: string;
  workflowState: LessonPlan['workflowState'];
  preferredScheduleBlockId: string;
  durationMinutes: string;
  learningTarget: string;
  notes: string;
}

export interface SessionEditorValues {
  date: string;
  scheduleBlockId: string;
  startTime: string;
  endTime: string;
}

export type LessonPlanEditableFields = Pick<
  LessonPlan,
  | 'title'
  | 'subject'
  | 'workflowState'
  | 'preferredScheduleBlockId'
  | 'durationMinutes'
  | 'learningTarget'
  | 'notes'
>;

export type SessionEditableFields = Pick<
  SessionOccurrence,
  'date' | 'scheduleBlockId' | 'startMinute' | 'endMinute'
>;

export const lessonPlanEditorValuesSchema = z.object({
  title: z.string().trim().min(1, 'Enter a planning title.'),
  subject: z.string().trim(),
  workflowState: z.enum(['draft', 'ready']),
  preferredScheduleBlockId: z.string(),
  durationMinutes: z.string().refine((value) => {
    if (!value.trim()) return true;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 1440;
  }, 'Duration must be a whole number between 1 and 1440.'),
  learningTarget: z.string(),
  notes: z.string(),
});

export const sessionEditorValuesSchema = z
  .object({
    date: z
      .string()
      .refine((value) => Boolean(parseLocalDate(value)), 'Choose a valid session date.'),
    scheduleBlockId: z.string(),
    startTime: z.string(),
    endTime: z.string(),
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

export function parseLessonPlanEditorValues(
  input: LessonPlanEditorValues,
): LessonPlanEditableFields {
  const values = lessonPlanEditorValuesSchema.parse(input);
  return {
    title: values.title,
    subject: values.subject,
    workflowState: values.workflowState,
    preferredScheduleBlockId: values.preferredScheduleBlockId || undefined,
    durationMinutes: values.durationMinutes ? Number(values.durationMinutes) : undefined,
    learningTarget: values.learningTarget.trim() || undefined,
    notes: values.notes.trim() || undefined,
  };
}

export function parseSessionEditorValues(input: SessionEditorValues): SessionEditableFields {
  const values = sessionEditorValuesSchema.parse(input);
  const fields: SessionEditableFields = {
    date: values.date,
    scheduleBlockId: values.scheduleBlockId || undefined,
    startMinute: timeToMinute(values.startTime),
    endMinute: timeToMinute(values.endTime),
  };

  sessionOccurrenceSchema.parse({
    id: 'session-editor-validation',
    lessonPlanId: 'lesson-plan-validation',
    contextId: 'context-validation',
    ...fields,
    deliveryState: 'scheduled',
  });
  return fields;
}

export function createLessonPlanEditorValues(
  preferredScheduleBlockId = '',
): LessonPlanEditorValues {
  return {
    title: '',
    subject: '',
    workflowState: 'draft',
    preferredScheduleBlockId,
    durationMinutes: '',
    learningTarget: '',
    notes: '',
  };
}

export function toLessonPlanEditorValues(plan: LessonPlan): LessonPlanEditorValues {
  lessonPlanSchema.parse(plan);
  return {
    title: plan.title,
    subject: plan.subject,
    workflowState: plan.workflowState === 'archived' ? 'draft' : plan.workflowState,
    preferredScheduleBlockId: plan.preferredScheduleBlockId ?? '',
    durationMinutes: plan.durationMinutes?.toString() ?? '',
    learningTarget: plan.learningTarget ?? '',
    notes: plan.notes ?? '',
  };
}

export function createSessionEditorValues(
  date: string,
  scheduleBlockId = '',
  startMinute = 540,
  endMinute = 600,
): SessionEditorValues {
  return {
    date,
    scheduleBlockId,
    startTime: minuteToTime(startMinute),
    endTime: minuteToTime(endMinute),
  };
}

export function toSessionEditorValues(session: SessionOccurrence): SessionEditorValues {
  sessionOccurrenceSchema.parse(session);
  return {
    date: session.date,
    scheduleBlockId: session.scheduleBlockId ?? '',
    startTime: minuteToTime(session.startMinute),
    endTime: minuteToTime(session.endMinute),
  };
}
