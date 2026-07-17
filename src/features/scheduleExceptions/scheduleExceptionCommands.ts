import { z } from 'zod';

import { scheduleBlockSchema, scheduleExceptionSchema } from '@/domain/models/entities';

export const SCHEDULE_EXCEPTION_COMMAND_PREFIX = 'schedule-exception.';

const scheduleBlockPutOperationSchema = z.object({
  table: z.literal('scheduleBlocks'),
  action: z.literal('put'),
  record: scheduleBlockSchema,
});
const scheduleBlockDeleteOperationSchema = z.object({
  table: z.literal('scheduleBlocks'),
  action: z.literal('delete'),
  id: z.string().min(1),
});
const scheduleExceptionPutOperationSchema = z.object({
  table: z.literal('scheduleExceptions'),
  action: z.literal('put'),
  record: scheduleExceptionSchema,
});
const scheduleExceptionDeleteOperationSchema = z.object({
  table: z.literal('scheduleExceptions'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const scheduleExceptionOperationSchema = z.union([
  scheduleBlockPutOperationSchema,
  scheduleBlockDeleteOperationSchema,
  scheduleExceptionPutOperationSchema,
  scheduleExceptionDeleteOperationSchema,
]);

export const scheduleExceptionCommandSchema = z.object({
  version: z.literal(1),
  operations: z.array(scheduleExceptionOperationSchema).min(1),
});

export type ScheduleExceptionOperation = z.infer<typeof scheduleExceptionOperationSchema>;
export type ScheduleExceptionCommand = z.infer<typeof scheduleExceptionCommandSchema>;

export interface ScheduleExceptionCommandPair {
  forward: ScheduleExceptionCommand;
  inverse: ScheduleExceptionCommand;
}

export function createScheduleExceptionCommand(
  operations: readonly ScheduleExceptionOperation[],
): ScheduleExceptionCommand {
  return scheduleExceptionCommandSchema.parse({ version: 1, operations });
}

export function serializeScheduleExceptionCommand(command: ScheduleExceptionCommand): string {
  return JSON.stringify(scheduleExceptionCommandSchema.parse(command));
}

export function parseScheduleExceptionCommand(json: string): ScheduleExceptionCommand {
  return scheduleExceptionCommandSchema.parse(JSON.parse(json) as unknown);
}
