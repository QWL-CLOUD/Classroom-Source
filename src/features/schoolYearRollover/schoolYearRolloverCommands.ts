import { z } from 'zod';

import {
  contextMembershipSchema,
  learnerContextSchema,
  scheduleBlockSchema,
  type ContextMembership,
  type LearnerContext,
  type ScheduleBlock,
} from '@/domain/models/entities';

export const SCHOOL_YEAR_ROLLOVER_COMMAND_PREFIX = 'school-year-rollover.';

const putLearnerContextOperationSchema = z.object({
  table: z.literal('learnerContexts'),
  action: z.literal('put'),
  record: learnerContextSchema,
});

const deleteLearnerContextOperationSchema = z.object({
  table: z.literal('learnerContexts'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putContextMembershipOperationSchema = z.object({
  table: z.literal('contextMemberships'),
  action: z.literal('put'),
  record: contextMembershipSchema,
});

const deleteContextMembershipOperationSchema = z.object({
  table: z.literal('contextMemberships'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putScheduleBlockOperationSchema = z.object({
  table: z.literal('scheduleBlocks'),
  action: z.literal('put'),
  record: scheduleBlockSchema,
});

const deleteScheduleBlockOperationSchema = z.object({
  table: z.literal('scheduleBlocks'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const schoolYearRolloverOperationSchema = z.union([
  putLearnerContextOperationSchema,
  deleteLearnerContextOperationSchema,
  putContextMembershipOperationSchema,
  deleteContextMembershipOperationSchema,
  putScheduleBlockOperationSchema,
  deleteScheduleBlockOperationSchema,
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

export function putRolloverLearnerContext(record: LearnerContext): SchoolYearRolloverOperation {
  return schoolYearRolloverOperationSchema.parse({
    table: 'learnerContexts',
    action: 'put',
    record,
  });
}

export function deleteRolloverLearnerContext(id: string): SchoolYearRolloverOperation {
  return schoolYearRolloverOperationSchema.parse({
    table: 'learnerContexts',
    action: 'delete',
    id,
  });
}

export function putRolloverContextMembership(
  record: ContextMembership,
): SchoolYearRolloverOperation {
  return schoolYearRolloverOperationSchema.parse({
    table: 'contextMemberships',
    action: 'put',
    record,
  });
}

export function deleteRolloverContextMembership(id: string): SchoolYearRolloverOperation {
  return schoolYearRolloverOperationSchema.parse({
    table: 'contextMemberships',
    action: 'delete',
    id,
  });
}

export function putRolloverScheduleBlock(record: ScheduleBlock): SchoolYearRolloverOperation {
  return schoolYearRolloverOperationSchema.parse({
    table: 'scheduleBlocks',
    action: 'put',
    record,
  });
}

export function deleteRolloverScheduleBlock(id: string): SchoolYearRolloverOperation {
  return schoolYearRolloverOperationSchema.parse({
    table: 'scheduleBlocks',
    action: 'delete',
    id,
  });
}

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
