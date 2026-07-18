import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { changeLogSchema, type ChangeLog } from '@/domain/models/entities';
import {
  LEARNER_CONTEXT_COMMAND_PREFIX,
  parseLearnerContextCommand,
  type LearnerContextCommand,
} from '@/features/learners/learnerContextCommands';
import {
  parsePlanningCommand,
  PLANNING_COMMAND_PREFIX,
  type PlanningCommand,
} from '@/features/planning/planningCommands';
import {
  parseScheduleExceptionCommand,
  SCHEDULE_EXCEPTION_COMMAND_PREFIX,
  type ScheduleExceptionCommand,
} from '@/features/scheduleExceptions/scheduleExceptionCommands';

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
  | { entity: 'schedule-block'; command: ScheduleBlockCommand }
  | { entity: 'schedule-exception'; command: ScheduleExceptionCommand }
  | { entity: 'planning'; command: PlanningCommand }
  | { entity: 'learner-context'; command: LearnerContextCommand };

export function isSupportedEditChangeLog(log: ChangeLog): boolean {
  return (
    log.commandType.startsWith(CALENDAR_EVENT_COMMAND_PREFIX) ||
    log.commandType.startsWith(SCHEDULE_BLOCK_COMMAND_PREFIX) ||
    log.commandType.startsWith(SCHEDULE_EXCEPTION_COMMAND_PREFIX) ||
    log.commandType.startsWith(PLANNING_COMMAND_PREFIX) ||
    log.commandType.startsWith(LEARNER_CONTEXT_COMMAND_PREFIX)
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
  if (commandType.startsWith(PLANNING_COMMAND_PREFIX)) {
    return {
      entity: 'planning',
      command: parsePlanningCommand(json),
    };
  }
  if (commandType.startsWith(LEARNER_CONTEXT_COMMAND_PREFIX)) {
    return {
      entity: 'learner-context',
      command: parseLearnerContextCommand(json),
    };
  }
  if (commandType.startsWith(SCHEDULE_EXCEPTION_COMMAND_PREFIX)) {
    return {
      entity: 'schedule-exception',
      command: parseScheduleExceptionCommand(json),
    };
  }
  throw new Error(`Unsupported edit command: ${commandType}`);
}

export async function applySupportedEditCommand(
  db: ClassroomDatabase,
  parsed: SupportedEditCommand,
): Promise<void> {
  if (parsed.entity === 'calendar-event') {
    if (parsed.command.action === 'put') await db.calendarEvents.put(parsed.command.record);
    else await db.calendarEvents.delete(parsed.command.id);
    return;
  }

  if (parsed.entity === 'schedule-block') {
    if (parsed.command.action === 'put') await db.scheduleBlocks.put(parsed.command.record);
    else await db.scheduleBlocks.delete(parsed.command.id);
    return;
  }

  if (parsed.entity === 'learner-context') {
    for (const operation of parsed.command.operations) {
      if (operation.table === 'learnerContexts') {
        if (operation.action === 'put') await db.learnerContexts.put(operation.record);
        else await db.learnerContexts.delete(operation.id);
      } else if (operation.action === 'put') {
        await db.contextMemberships.put(operation.record);
      } else {
        await db.contextMemberships.delete(operation.id);
      }
    }
    return;
  }

  if (parsed.entity === 'planning') {
    for (const operation of parsed.command.operations) {
      if (operation.table === 'lessonSeries') {
        if (operation.action === 'put') await db.lessonSeries.put(operation.record);
        else await db.lessonSeries.delete(operation.id);
      } else if (operation.table === 'lessonPlans') {
        if (operation.action === 'put') await db.lessonPlans.put(operation.record);
        else await db.lessonPlans.delete(operation.id);
      } else if (operation.action === 'put') {
        await db.sessionOccurrences.put(operation.record);
      } else {
        await db.sessionOccurrences.delete(operation.id);
      }
    }
    return;
  }

  for (const operation of parsed.command.operations) {
    if (operation.table === 'scheduleBlocks') {
      if (operation.action === 'put') await db.scheduleBlocks.put(operation.record);
      else await db.scheduleBlocks.delete(operation.id);
    } else if (operation.action === 'put') {
      await db.scheduleExceptions.put(operation.record);
    } else {
      await db.scheduleExceptions.delete(operation.id);
    }
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
