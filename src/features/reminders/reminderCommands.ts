import { z } from 'zod';

import { reminderSchema, type ChangeLog, type Reminder } from '@/domain/models/entities';

export const REMINDER_COMMAND_PREFIX = 'reminder.';

const putReminderOperationSchema = z.object({
  table: z.literal('reminders'),
  action: z.literal('put'),
  record: reminderSchema,
});

const deleteReminderOperationSchema = z.object({
  table: z.literal('reminders'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const reminderOperationSchema = z.union([
  putReminderOperationSchema,
  deleteReminderOperationSchema,
]);

export const reminderCommandSchema = z.object({
  operations: z.array(reminderOperationSchema).min(1),
});

export type ReminderOperation = z.infer<typeof reminderOperationSchema>;
export type ReminderCommand = z.infer<typeof reminderCommandSchema>;

export interface ReminderCommandPair {
  forward: ReminderCommand;
  inverse: ReminderCommand;
}

export function putReminderOperation(record: Reminder): ReminderOperation {
  return reminderOperationSchema.parse({ table: 'reminders', action: 'put', record });
}

export function deleteReminderOperation(id: string): ReminderOperation {
  return reminderOperationSchema.parse({ table: 'reminders', action: 'delete', id });
}

export function createReminderCommand(operations: readonly ReminderOperation[]): ReminderCommand {
  return reminderCommandSchema.parse({ operations });
}

export function serializeReminderCommand(command: ReminderCommand): string {
  return JSON.stringify(reminderCommandSchema.parse(command));
}

export function parseReminderCommand(json: string): ReminderCommand {
  return reminderCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isReminderChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(REMINDER_COMMAND_PREFIX);
}
