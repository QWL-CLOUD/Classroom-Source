import { z } from 'zod';

import { calendarEventSchema, type CalendarEvent, type ChangeLog } from '@/domain/models/entities';

export const CALENDAR_EVENT_COMMAND_PREFIX = 'calendar-event.';

const putCalendarEventCommandSchema = z.object({
  table: z.literal('calendarEvents'),
  action: z.literal('put'),
  record: calendarEventSchema,
});

const deleteCalendarEventCommandSchema = z.object({
  table: z.literal('calendarEvents'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const calendarEventCommandSchema = z.discriminatedUnion('action', [
  putCalendarEventCommandSchema,
  deleteCalendarEventCommandSchema,
]);

export type CalendarEventCommand = z.infer<typeof calendarEventCommandSchema>;

export interface CalendarEventCommandPair {
  forward: CalendarEventCommand;
  inverse: CalendarEventCommand;
}

export function putCalendarEventCommand(record: CalendarEvent): CalendarEventCommand {
  return calendarEventCommandSchema.parse({
    table: 'calendarEvents',
    action: 'put',
    record,
  });
}

export function deleteCalendarEventCommand(id: string): CalendarEventCommand {
  return calendarEventCommandSchema.parse({
    table: 'calendarEvents',
    action: 'delete',
    id,
  });
}

export function serializeCalendarEventCommand(command: CalendarEventCommand): string {
  return JSON.stringify(calendarEventCommandSchema.parse(command));
}

export function parseCalendarEventCommand(json: string): CalendarEventCommand {
  return calendarEventCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isCalendarEventChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(CALENDAR_EVENT_COMMAND_PREFIX);
}
