import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { changeLogSchema, type ChangeLog } from '@/domain/models/entities';

import {
  CALENDAR_EVENT_COMMAND_PREFIX,
  parseCalendarEventCommand,
  type CalendarEventCommand,
} from './calendarEventCommands';
import {
  parseScheduleBlockCommand,
  SCHEDULE_BLOCK_COMMAND_PREFIX,
  type ScheduleBlockCommand,
} from './scheduleBlockCommands';

export type SupportedEditCommand =
  | { entity: 'calendar-event'; command: CalendarEventCommand }
  | { entity: 'schedule-block'; command: ScheduleBlockCommand };

export function isSupportedEditChangeLog(log: ChangeLog): boolean {
  return (
    log.commandType.startsWith(CALENDAR_EVENT_COMMAND_PREFIX) ||
    log.commandType.startsWith(SCHEDULE_BLOCK_COMMAND_PREFIX)
  );
}

export function parseSupportedEditCommand(commandType: string, json: string): SupportedEditCommand {
  if (commandType.startsWith(CALENDAR_EVENT_COMMAND_PREFIX)) {
    return {
      entity: 'calendar-event',
      command: parseCalendarEventCommand(json),
    };
  }
  if (commandType.startsWith(SCHEDULE_BLOCK_COMMAND_PREFIX)) {
    return {
      entity: 'schedule-block',
      command: parseScheduleBlockCommand(json),
    };
  }
  throw new Error(`Unsupported edit command: ${commandType}`);
}

export async function applySupportedEditCommand(
  db: ClassroomDatabase,
  parsed: SupportedEditCommand,
): Promise<void> {
  if (parsed.entity === 'calendar-event') {
    if (parsed.command.action === 'put') {
      await db.calendarEvents.put(parsed.command.record);
    } else {
      await db.calendarEvents.delete(parsed.command.id);
    }
    return;
  }

  if (parsed.command.action === 'put') {
    await db.scheduleBlocks.put(parsed.command.record);
  } else {
    await db.scheduleBlocks.delete(parsed.command.id);
  }
}

export async function listSupportedEditLogs(db: ClassroomDatabase): Promise<ChangeLog[]> {
  const values = await db.changeLog.toArray();
  const logs: ChangeLog[] = [];

  for (const value of values) {
    const parsed = changeLogSchema.safeParse(value);
    if (!parsed.success || !isSupportedEditChangeLog(parsed.data)) continue;

    try {
      parseSupportedEditCommand(parsed.data.commandType, parsed.data.forwardJson);
      parseSupportedEditCommand(parsed.data.commandType, parsed.data.inverseJson);
      logs.push(parsed.data);
    } catch {
      // Malformed or future command records remain untouched but cannot enter active history.
    }
  }

  return logs;
}

export async function clearSupportedRedoBranch(db: ClassroomDatabase): Promise<void> {
  const logs = await listSupportedEditLogs(db);
  const redoIds = logs.filter((log) => Boolean(log.undoneAt)).map((log) => log.id);
  if (redoIds.length > 0) await db.changeLog.bulkDelete(redoIds);
}
