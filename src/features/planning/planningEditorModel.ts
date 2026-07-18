import { z } from 'zod';

import {
  lessonContentSchema,
  lessonFlowPhaseSchema,
  lessonFlowStepSchema,
  lessonPlanSchema,
  sessionOccurrenceSchema,
  type LessonContent,
  type LessonFlowPhase,
  type LessonFlowStep,
  type LessonPlan,
  type SessionOccurrence,
} from '@/domain/models/entities';
import { minuteToTime, timeToMinute } from '@/features/editing/calendarEventEditorModel';
import { parseLocalDate } from '@/shared/dates/localDate';
import { randomUUID } from '@/shared/ids/randomId';

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const lessonFlowPhaseLabels: Record<LessonFlowPhase, string> = {
  opening: 'Opening',
  instruction: 'Instruction',
  'guided-practice': 'Guided practice',
  'independent-practice': 'Independent practice',
  assessment: 'Assessment',
  closure: 'Closure',
  transition: 'Transition',
  other: 'Other',
};

export interface LessonFlowStepEditorValues {
  id: string;
  title: string;
  phase: LessonFlowPhase;
  durationMinutes: string;
  details: string;
  teacherNotes: string;
}

export interface LessonContentEditorValues {
  learningTarget: string;
  notes: string;
  lessonFlow: LessonFlowStepEditorValues[];
}

export type LessonSeriesMode = 'none' | 'existing' | 'new';

export interface LessonPlanEditorValues extends LessonContentEditorValues {
  title: string;
  subject: string;
  workflowState: LessonPlan['workflowState'];
  preferredScheduleBlockId: string;
  durationMinutes: string;
  seriesMode: LessonSeriesMode;
  seriesId: string;
  newSeriesTitle: string;
}

export interface SessionEditorValues extends LessonContentEditorValues {
  date: string;
  scheduleBlockId: string;
  startTime: string;
  endTime: string;
  contentMode: 'inherit' | 'custom';
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
  | 'lessonFlow'
>;

export type LessonSeriesAssignment =
  { kind: 'none' } | { kind: 'existing'; seriesId: string } | { kind: 'new'; title: string };

export interface ParsedLessonPlanEditorValues {
  fields: LessonPlanEditableFields;
  series: LessonSeriesAssignment;
}

export type SessionEditableFields = Pick<
  SessionOccurrence,
  'date' | 'scheduleBlockId' | 'startMinute' | 'endMinute' | 'contentOverride'
>;

const optionalDurationSchema = z.string().refine((value) => {
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 1440;
}, 'Duration must be a whole number between 1 and 1440.');

export const lessonFlowStepEditorValuesSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, 'Enter a title for every lesson-flow step.'),
  phase: lessonFlowPhaseSchema,
  durationMinutes: optionalDurationSchema,
  details: z.string(),
  teacherNotes: z.string(),
});

export const lessonContentEditorValuesSchema = z.object({
  learningTarget: z.string(),
  notes: z.string(),
  lessonFlow: z.array(lessonFlowStepEditorValuesSchema),
});

export const lessonPlanEditorValuesSchema = lessonContentEditorValuesSchema
  .extend({
    title: z.string().trim().min(1, 'Enter a planning title.'),
    subject: z.string().trim(),
    workflowState: z.enum(['draft', 'ready']),
    preferredScheduleBlockId: z.string(),
    durationMinutes: optionalDurationSchema,
    seriesMode: z.enum(['none', 'existing', 'new']),
    seriesId: z.string(),
    newSeriesTitle: z.string(),
  })
  .superRefine((values, context) => {
    if (values.seriesMode === 'existing' && !values.seriesId.trim()) {
      context.addIssue({
        code: 'custom',
        path: ['seriesId'],
        message: 'Choose an existing lesson series.',
      });
    }
    if (values.seriesMode === 'new' && !values.newSeriesTitle.trim()) {
      context.addIssue({
        code: 'custom',
        path: ['newSeriesTitle'],
        message: 'Enter a title for the new lesson series.',
      });
    }
  });

export const sessionEditorValuesSchema = lessonContentEditorValuesSchema
  .extend({
    date: z
      .string()
      .refine((value) => Boolean(parseLocalDate(value)), 'Choose a valid session date.'),
    scheduleBlockId: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    contentMode: z.enum(['inherit', 'custom']),
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

function parseLessonFlowStep(values: LessonFlowStepEditorValues): LessonFlowStep {
  const parsed = lessonFlowStepEditorValuesSchema.parse(values);
  return lessonFlowStepSchema.parse({
    id: parsed.id,
    title: parsed.title,
    phase: parsed.phase,
    durationMinutes: parsed.durationMinutes ? Number(parsed.durationMinutes) : undefined,
    details: parsed.details.trim() || undefined,
    teacherNotes: parsed.teacherNotes.trim() || undefined,
  });
}

export function parseLessonContentEditorValues(input: LessonContentEditorValues): LessonContent {
  const values = lessonContentEditorValuesSchema.parse(input);
  return lessonContentSchema.parse({
    learningTarget: values.learningTarget.trim() || undefined,
    notes: values.notes.trim() || undefined,
    lessonFlow: values.lessonFlow.map(parseLessonFlowStep),
  });
}

export function parseLessonPlanEditorValues(
  input: LessonPlanEditorValues,
): ParsedLessonPlanEditorValues {
  const values = lessonPlanEditorValuesSchema.parse(input);
  const content = parseLessonContentEditorValues(values);
  const series: LessonSeriesAssignment =
    values.seriesMode === 'existing'
      ? { kind: 'existing', seriesId: values.seriesId }
      : values.seriesMode === 'new'
        ? { kind: 'new', title: values.newSeriesTitle.trim() }
        : { kind: 'none' };
  return {
    fields: {
      title: values.title,
      subject: values.subject,
      workflowState: values.workflowState,
      preferredScheduleBlockId: values.preferredScheduleBlockId || undefined,
      durationMinutes: values.durationMinutes ? Number(values.durationMinutes) : undefined,
      ...content,
    },
    series,
  };
}

export function parseSessionEditorValues(input: SessionEditorValues): SessionEditableFields {
  const values = sessionEditorValuesSchema.parse(input);
  const fields: SessionEditableFields = {
    date: values.date,
    scheduleBlockId: values.scheduleBlockId || undefined,
    startMinute: timeToMinute(values.startTime),
    endMinute: timeToMinute(values.endTime),
    contentOverride:
      values.contentMode === 'custom' ? parseLessonContentEditorValues(values) : undefined,
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

export function createLessonFlowStepEditorValues(
  phase: LessonFlowPhase = 'instruction',
): LessonFlowStepEditorValues {
  return {
    id: randomUUID(),
    title: '',
    phase,
    durationMinutes: '',
    details: '',
    teacherNotes: '',
  };
}

export function toLessonFlowStepEditorValues(step: LessonFlowStep): LessonFlowStepEditorValues {
  const parsed = lessonFlowStepSchema.parse(step);
  return {
    id: parsed.id,
    title: parsed.title,
    phase: parsed.phase,
    durationMinutes: parsed.durationMinutes?.toString() ?? '',
    details: parsed.details ?? '',
    teacherNotes: parsed.teacherNotes ?? '',
  };
}

export function createLessonContentEditorValues(
  content?: Partial<LessonContent>,
): LessonContentEditorValues {
  return {
    learningTarget: content?.learningTarget ?? '',
    notes: content?.notes ?? '',
    lessonFlow: (content?.lessonFlow ?? []).map(toLessonFlowStepEditorValues),
  };
}

export function resolveSessionLessonContent(
  plan: LessonPlan,
  session?: SessionOccurrence | null,
): { source: 'plan' | 'session'; content: LessonContent } {
  const parsedPlan = lessonPlanSchema.parse(plan);
  const parsedSession = session ? sessionOccurrenceSchema.parse(session) : null;
  if (parsedSession?.contentOverride) {
    return { source: 'session', content: lessonContentSchema.parse(parsedSession.contentOverride) };
  }
  return {
    source: 'plan',
    content: lessonContentSchema.parse({
      learningTarget: parsedPlan.learningTarget,
      notes: parsedPlan.notes,
      lessonFlow: parsedPlan.lessonFlow ?? [],
    }),
  };
}

export function lessonFlowDurationMinutes(steps: readonly LessonFlowStep[]): number {
  return steps.reduce((total, step) => total + (step.durationMinutes ?? 0), 0);
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
    seriesMode: 'none',
    seriesId: '',
    newSeriesTitle: '',
    ...createLessonContentEditorValues(),
  };
}

export function toLessonPlanEditorValues(plan: LessonPlan): LessonPlanEditorValues {
  const parsed = lessonPlanSchema.parse(plan);
  return {
    title: parsed.title,
    subject: parsed.subject,
    workflowState: parsed.workflowState === 'archived' ? 'draft' : parsed.workflowState,
    preferredScheduleBlockId: parsed.preferredScheduleBlockId ?? '',
    durationMinutes: parsed.durationMinutes?.toString() ?? '',
    seriesMode: parsed.seriesId ? 'existing' : 'none',
    seriesId: parsed.seriesId ?? '',
    newSeriesTitle: '',
    ...createLessonContentEditorValues({
      learningTarget: parsed.learningTarget,
      notes: parsed.notes,
      lessonFlow: parsed.lessonFlow ?? [],
    }),
  };
}

export function createSessionEditorValues(
  date: string,
  scheduleBlockId = '',
  startMinute = 540,
  endMinute = 600,
  plan?: LessonPlan,
): SessionEditorValues {
  const inherited = plan
    ? resolveSessionLessonContent(plan).content
    : lessonContentSchema.parse({ lessonFlow: [] });
  return {
    date,
    scheduleBlockId,
    startTime: minuteToTime(startMinute),
    endTime: minuteToTime(endMinute),
    contentMode: 'inherit',
    ...createLessonContentEditorValues(inherited),
  };
}

export function toSessionEditorValues(
  session: SessionOccurrence,
  plan: LessonPlan,
): SessionEditorValues {
  const parsedSession = sessionOccurrenceSchema.parse(session);
  const resolved = resolveSessionLessonContent(plan, parsedSession);
  return {
    date: parsedSession.date,
    scheduleBlockId: parsedSession.scheduleBlockId ?? '',
    startTime: minuteToTime(parsedSession.startMinute),
    endTime: minuteToTime(parsedSession.endMinute),
    contentMode: resolved.source === 'session' ? 'custom' : 'inherit',
    ...createLessonContentEditorValues(resolved.content),
  };
}
