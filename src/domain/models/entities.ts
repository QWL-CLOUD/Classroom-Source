import { z } from 'zod';
import { LOCAL_DATE_PATTERN } from '@/shared/dates/localDate';

const idSchema = z.string().min(1);
const timestampSchema = z.iso.datetime();
const localDateSchema = z.string().regex(LOCAL_DATE_PATTERN);
const minuteSchema = z.number().int().min(0).max(1439);

export const schoolYearSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  startsOn: localDateSchema,
  endsOn: localDateSchema,
  active: z.boolean(),
});

export const learnerContextSchema = z.object({
  id: idSchema,
  kind: z.enum(['class', 'group', 'individual']),
  name: z.string().min(1),
  preferredName: z.string().optional(),
  schoolYearId: idSchema,
  status: z.enum(['active', 'archived']).default('active'),
  notes: z.string().optional(),
});

export const contextMembershipSchema = z.object({
  id: idSchema,
  containerContextId: idSchema,
  memberContextId: idSchema,
  role: z.string().optional(),
});

export const scheduleBlockSchema = z
  .object({
    id: idSchema,
    parentId: idSchema.optional(),
    contextId: idSchema.optional(),
    title: z.string().min(1),
    subject: z.string().default(''),
    category: z.string().default('Teaching'),
    kind: z.enum(['container', 'teachable', 'routine', 'transition']),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
    startMinute: minuteSchema,
    endMinute: minuteSchema,
    effectiveFrom: localDateSchema.optional(),
    effectiveTo: localDateSchema.optional(),
    planningEnabled: z.boolean().default(false),
    bumpEnabled: z.boolean().default(false),
    showInWeek: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
    archivedAt: timestampSchema.optional(),
  })
  .refine((value) => value.endMinute > value.startMinute, {
    message: 'endMinute must be after startMinute',
    path: ['endMinute'],
  });

export const scheduleExceptionSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  scheduleBlockId: idSchema.optional(),
  action: z.enum(['cancel', 'modify', 'add']),
  replacementStartMinute: minuteSchema.optional(),
  replacementEndMinute: minuteSchema.optional(),
  replacementTitle: z.string().optional(),
  reason: z.string().optional(),
});

export const calendarEventSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    startDate: localDateSchema,
    endDate: localDateSchema.optional(),
    startMinute: minuteSchema.optional(),
    endMinute: minuteSchema.optional(),
    category: z.string().default('Calendar'),
    details: z.string().optional(),
    contextId: idSchema.optional(),
    source: z.string().optional(),
  })
  .refine(
    (value) =>
      !value.endMinute || value.startMinute === undefined || value.endMinute > value.startMinute,
    { message: 'endMinute must be after startMinute', path: ['endMinute'] },
  );

export const lessonSeriesSchema = z.object({
  id: idSchema,
  contextId: idSchema,
  title: z.string().min(1),
  subject: z.string().default(''),
});

export const lessonFlowPhaseSchema = z.enum([
  'opening',
  'instruction',
  'guided-practice',
  'independent-practice',
  'assessment',
  'closure',
  'transition',
  'other',
]);

export const lessonFlowStepSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  phase: lessonFlowPhaseSchema.default('instruction'),
  durationMinutes: z.number().int().positive().max(1440).optional(),
  details: z.string().optional(),
  teacherNotes: z.string().optional(),
});

export const lessonContentSchema = z.object({
  learningTarget: z.string().optional(),
  notes: z.string().optional(),
  lessonFlow: z.array(lessonFlowStepSchema).default([]),
});

export const lessonPlanSchema = z.object({
  id: idSchema,
  contextId: idSchema,
  title: z.string().min(1),
  subject: z.string().default(''),
  workflowState: z.enum(['draft', 'ready', 'archived']),
  seriesId: idSchema.optional(),
  sequence: z.number().int().nonnegative().optional(),
  preferredScheduleBlockId: idSchema.optional(),
  durationMinutes: z.number().int().positive().optional(),
  learningTarget: z.string().optional(),
  notes: z.string().optional(),
  lessonFlow: z.array(lessonFlowStepSchema).optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const sessionOccurrenceSchema = z
  .object({
    id: idSchema,
    lessonPlanId: idSchema,
    contextId: idSchema,
    scheduleBlockId: idSchema.optional(),
    date: localDateSchema,
    startMinute: minuteSchema,
    endMinute: minuteSchema,
    deliveryState: z.enum(['scheduled', 'completed', 'cancelled']),
    completedAt: timestampSchema.optional(),
    reflectionId: idSchema.optional(),
    contentOverride: lessonContentSchema.optional(),
  })
  .refine((value) => value.endMinute > value.startMinute, {
    message: 'endMinute must be after startMinute',
    path: ['endMinute'],
  });

export const taskSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  status: z.enum(['active', 'completed']),
  dueDate: localDateSchema.optional(),
  contextId: idSchema.optional(),
  linkedEntityType: z.string().optional(),
  linkedEntityId: idSchema.optional(),
  order: z.number().int().default(0),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  completedAt: timestampSchema.optional(),
});

export const quickCaptureSchema = z.object({
  id: idSchema,
  text: z.string().min(1),
  capturedOn: localDateSchema,
  createdAt: timestampSchema,
});

export const migrationRunSchema = z.object({
  id: idSchema,
  sourceFormat: z.string(),
  sourceAppVersion: z.string().optional(),
  startedAt: timestampSchema,
  completedAt: timestampSchema.optional(),
  status: z.enum(['previewed', 'committed', 'rolled-back', 'failed']),
  summaryJson: z.string(),
});

export const quarantineRecordSchema = z.object({
  id: idSchema,
  migrationRunId: idSchema,
  entityType: z.string(),
  legacyStoreKey: z.string(),
  legacyId: z.string().optional(),
  reason: z.string(),
  rawJson: z.string(),
  createdAt: timestampSchema,
});

export const changeLogSchema = z.object({
  id: idSchema,
  label: z.string(),
  commandType: z.string(),
  forwardJson: z.string(),
  inverseJson: z.string(),
  createdAt: timestampSchema,
  undoneAt: timestampSchema.optional(),
});

export const appSettingSchema = z.object({
  key: z.string().min(1),
  valueJson: z.string(),
  updatedAt: timestampSchema,
});

export type SchoolYear = z.infer<typeof schoolYearSchema>;
export type LearnerContext = z.infer<typeof learnerContextSchema>;
export type ContextMembership = z.infer<typeof contextMembershipSchema>;
export type ScheduleBlock = z.infer<typeof scheduleBlockSchema>;
export type ScheduleException = z.infer<typeof scheduleExceptionSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type LessonSeries = z.infer<typeof lessonSeriesSchema>;
export type LessonFlowPhase = z.infer<typeof lessonFlowPhaseSchema>;
export type LessonFlowStep = z.infer<typeof lessonFlowStepSchema>;
export type LessonContent = z.infer<typeof lessonContentSchema>;
export type LessonPlan = z.infer<typeof lessonPlanSchema>;
export type SessionOccurrence = z.infer<typeof sessionOccurrenceSchema>;
export type Task = z.infer<typeof taskSchema>;
export type QuickCapture = z.infer<typeof quickCaptureSchema>;
export type MigrationRun = z.infer<typeof migrationRunSchema>;
export type QuarantineRecord = z.infer<typeof quarantineRecordSchema>;
export type ChangeLog = z.infer<typeof changeLogSchema>;
export type AppSetting = z.infer<typeof appSettingSchema>;
