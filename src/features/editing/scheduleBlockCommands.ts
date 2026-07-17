import { z } from 'zod';

import { scheduleBlockSchema, type ChangeLog, type ScheduleBlock } from '@/domain/models/entities';

export const SCHEDULE_BLOCK_COMMAND_PREFIX = 'schedule-block.';

const putScheduleBlockCommandSchema = z.object({
  table: z.literal('scheduleBlocks'),
  action: z.literal('put'),
  record: scheduleBlockSchema,
});

const deleteScheduleBlockCommandSchema = z.object({
  table: z.literal('scheduleBlocks'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const scheduleBlockCommandSchema = z.discriminatedUnion('action', [
  putScheduleBlockCommandSchema,
  deleteScheduleBlockCommandSchema,
]);

export type ScheduleBlockCommand = z.infer<typeof scheduleBlockCommandSchema>;

export interface ScheduleBlockCommandPair {
  forward: ScheduleBlockCommand;
  inverse: ScheduleBlockCommand;
}

export function putScheduleBlockCommand(record: ScheduleBlock): ScheduleBlockCommand {
  return scheduleBlockCommandSchema.parse({
    table: 'scheduleBlocks',
    action: 'put',
    record,
  });
}

export function deleteScheduleBlockCommand(id: string): ScheduleBlockCommand {
  return scheduleBlockCommandSchema.parse({
    table: 'scheduleBlocks',
    action: 'delete',
    id,
  });
}

export function serializeScheduleBlockCommand(command: ScheduleBlockCommand): string {
  return JSON.stringify(scheduleBlockCommandSchema.parse(command));
}

export function parseScheduleBlockCommand(json: string): ScheduleBlockCommand {
  return scheduleBlockCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isScheduleBlockChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(SCHEDULE_BLOCK_COMMAND_PREFIX);
}
