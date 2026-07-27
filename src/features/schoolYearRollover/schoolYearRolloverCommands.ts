import { z } from 'zod';

import {
  categoryAssignmentSchema,
  contextMembershipSchema,
  learnerContextSchema,
  lessonPlanSchema,
  lessonSeriesSchema,
  scheduleBlockSchema,
  standardAlignmentSchema,
  type CategoryAssignment,
  type ContextMembership,
  type LearnerContext,
  type LessonPlan,
  type LessonSeries,
  type ScheduleBlock,
  type StandardAlignment,
} from '@/domain/models/entities';

export const SCHOOL_YEAR_ROLLOVER_COMMAND_PREFIX = 'school-year-rollover.';

function putSchema<T extends z.ZodTypeAny>(table: string, record: T) {
  return z.object({ table: z.literal(table), action: z.literal('put'), record });
}

function deleteSchema(table: string) {
  return z.object({ table: z.literal(table), action: z.literal('delete'), id: z.string().min(1) });
}

export const schoolYearRolloverOperationSchema = z.union([
  putSchema('learnerContexts', learnerContextSchema),
  deleteSchema('learnerContexts'),
  putSchema('contextMemberships', contextMembershipSchema),
  deleteSchema('contextMemberships'),
  putSchema('scheduleBlocks', scheduleBlockSchema),
  deleteSchema('scheduleBlocks'),
  putSchema('lessonSeries', lessonSeriesSchema),
  deleteSchema('lessonSeries'),
  putSchema('lessonPlans', lessonPlanSchema),
  deleteSchema('lessonPlans'),
  putSchema('standardAlignments', standardAlignmentSchema),
  deleteSchema('standardAlignments'),
  putSchema('categoryAssignments', categoryAssignmentSchema),
  deleteSchema('categoryAssignments'),
]);

export const schoolYearRolloverCommandSchema = z.object({
  operations: z.array(schoolYearRolloverOperationSchema).min(1),
});

export type SchoolYearRolloverOperation = z.infer<typeof schoolYearRolloverOperationSchema>;
export type SchoolYearRolloverCommand = z.infer<typeof schoolYearRolloverCommandSchema>;

export interface SchoolYearRolloverCommandPair {
  forward: SchoolYearRolloverCommand;
  inverse: SchoolYearRolloverCommand;
}

function put(
  table: SchoolYearRolloverOperation['table'],
  record: unknown,
): SchoolYearRolloverOperation {
  return schoolYearRolloverOperationSchema.parse({ table, action: 'put', record });
}

function remove(
  table: SchoolYearRolloverOperation['table'],
  id: string,
): SchoolYearRolloverOperation {
  return schoolYearRolloverOperationSchema.parse({ table, action: 'delete', id });
}

export const putRolloverLearnerContext = (record: LearnerContext) => put('learnerContexts', record);
export const deleteRolloverLearnerContext = (id: string) => remove('learnerContexts', id);

export const putRolloverContextMembership = (record: ContextMembership) =>
  put('contextMemberships', record);
export const deleteRolloverContextMembership = (id: string) => remove('contextMemberships', id);

export const putRolloverScheduleBlock = (record: ScheduleBlock) => put('scheduleBlocks', record);
export const deleteRolloverScheduleBlock = (id: string) => remove('scheduleBlocks', id);

export const putRolloverLessonSeries = (record: LessonSeries) => put('lessonSeries', record);
export const deleteRolloverLessonSeries = (id: string) => remove('lessonSeries', id);

export const putRolloverLessonPlan = (record: LessonPlan) => put('lessonPlans', record);
export const deleteRolloverLessonPlan = (id: string) => remove('lessonPlans', id);

export const putRolloverStandardAlignment = (record: StandardAlignment) =>
  put('standardAlignments', record);
export const deleteRolloverStandardAlignment = (id: string) => remove('standardAlignments', id);

export const putRolloverCategoryAssignment = (record: CategoryAssignment) =>
  put('categoryAssignments', record);
export const deleteRolloverCategoryAssignment = (id: string) => remove('categoryAssignments', id);

export function createSchoolYearRolloverCommand(
  operations: readonly SchoolYearRolloverOperation[],
): SchoolYearRolloverCommand {
  return schoolYearRolloverCommandSchema.parse({ operations });
}

export function serializeSchoolYearRolloverCommand(command: SchoolYearRolloverCommand): string {
  return JSON.stringify(schoolYearRolloverCommandSchema.parse(command));
}

export function parseSchoolYearRolloverCommand(json: string): SchoolYearRolloverCommand {
  return schoolYearRolloverCommandSchema.parse(JSON.parse(json) as unknown);
}
