import { z } from 'zod';

import {
  calendarEventSchema,
  categoryAssignmentSchema,
  type CalendarEvent,
  type CategoryAssignment,
  type ChangeLog,
} from '@/domain/models/entities';

export const CALENDAR_EVENT_COMMAND_PREFIX = 'calendar-event.';

const putCalendarEventOperationSchema = z.object({
  table: z.literal('calendarEvents'),
  action: z.literal('put'),
  record: calendarEventSchema,
});

const deleteCalendarEventOperationSchema = z.object({
  table: z.literal('calendarEvents'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putCategoryAssignmentOperationSchema = z.object({
  table: z.literal('categoryAssignments'),
  action: z.literal('put'),
  record: categoryAssignmentSchema,
});

const deleteCategoryAssignmentOperationSchema = z.object({
  table: z.literal('categoryAssignments'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const calendarEventOperationSchema = z.union([
  putCalendarEventOperationSchema,
  deleteCalendarEventOperationSchema,
  putCategoryAssignmentOperationSchema,
  deleteCategoryAssignmentOperationSchema,
]);

export const calendarEventCommandSchema = z.object({
  operations: z.array(calendarEventOperationSchema).min(1),
});

const legacyCalendarEventCommandSchema = z.discriminatedUnion('action', [
  putCalendarEventOperationSchema,
  deleteCalendarEventOperationSchema,
]);

export type CalendarEventOperation = z.infer<typeof calendarEventOperationSchema>;
export type CalendarEventCommand = z.infer<typeof calendarEventCommandSchema>;

export interface CalendarEventCommandPair {
  forward: CalendarEventCommand;
  inverse: CalendarEventCommand;
}

export function putCalendarEventOperation(record: CalendarEvent): CalendarEventOperation {
  return calendarEventOperationSchema.parse({
    table: 'calendarEvents',
    action: 'put',
    record,
  });
}

export function deleteCalendarEventOperation(id: string): CalendarEventOperation {
  return calendarEventOperationSchema.parse({
    table: 'calendarEvents',
    action: 'delete',
    id,
  });
}

export function putCalendarEventCategoryAssignmentOperation(
  record: CategoryAssignment,
): CalendarEventOperation {
  return calendarEventOperationSchema.parse({
    table: 'categoryAssignments',
    action: 'put',
    record,
  });
}

export function deleteCalendarEventCategoryAssignmentOperation(id: string): CalendarEventOperation {
  return calendarEventOperationSchema.parse({
    table: 'categoryAssignments',
    action: 'delete',
    id,
  });
}

export function createCalendarEventCommand(
  operations: readonly CalendarEventOperation[],
): CalendarEventCommand {
  return calendarEventCommandSchema.parse({ operations });
}

export function putCalendarEventCommand(record: CalendarEvent): CalendarEventCommand {
  return createCalendarEventCommand([putCalendarEventOperation(record)]);
}

export function deleteCalendarEventCommand(id: string): CalendarEventCommand {
  return createCalendarEventCommand([deleteCalendarEventOperation(id)]);
}

export function serializeCalendarEventCommand(command: CalendarEventCommand): string {
  return JSON.stringify(calendarEventCommandSchema.parse(command));
}

export function parseCalendarEventCommand(json: string): CalendarEventCommand {
  const parsed = JSON.parse(json) as unknown;
  const current = calendarEventCommandSchema.safeParse(parsed);
  if (current.success) return current.data;
  const legacy = legacyCalendarEventCommandSchema.parse(parsed);
  return createCalendarEventCommand([legacy]);
}

export function isCalendarEventChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(CALENDAR_EVENT_COMMAND_PREFIX);
}
