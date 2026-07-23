import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  CATEGORY_COMMAND_PREFIX,
  parseCategoryCommand,
  type CategoryCommand,
} from '@/features/categories/categoryCommands';
import { changeLogSchema, type ChangeLog } from '@/domain/models/entities';
import {
  LIBRARY_CATALOG_COMMAND_PREFIX,
  parseLibraryCatalogCommand,
  type LibraryCatalogCommand,
} from '@/features/libraryCatalog/libraryCatalogCommands';
import {
  LEARNER_NOTICE_COMMAND_PREFIX,
  parseLearnerNoticeCommand,
  type LearnerNoticeCommand,
} from '@/features/learnerNotices/learnerNoticeCommands';
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
  parseReminderCommand,
  REMINDER_COMMAND_PREFIX,
  type ReminderCommand,
} from '@/features/reminders/reminderCommands';
import {
  parseScheduleExceptionCommand,
  SCHEDULE_EXCEPTION_COMMAND_PREFIX,
  type ScheduleExceptionCommand,
} from '@/features/scheduleExceptions/scheduleExceptionCommands';
import {
  parseSchoolYearCommand,
  SCHOOL_YEAR_COMMAND_PREFIX,
  type SchoolYearCommand,
} from '@/features/schoolYears/schoolYearCommands';
import {
  parseTaskCommand,
  TASK_COMMAND_PREFIX,
  type TaskCommand,
} from '@/features/tasks/taskCommands';

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
  | { entity: 'category'; command: CategoryCommand }
  | { entity: 'calendar-event'; command: CalendarEventCommand }
  | { entity: 'schedule-block'; command: ScheduleBlockCommand }
  | { entity: 'schedule-exception'; command: ScheduleExceptionCommand }
  | { entity: 'planning'; command: PlanningCommand }
  | { entity: 'learner-context'; command: LearnerContextCommand }
  | { entity: 'learner-notice'; command: LearnerNoticeCommand }
  | { entity: 'library-catalog'; command: LibraryCatalogCommand }
  | { entity: 'task'; command: TaskCommand }
  | { entity: 'reminder'; command: ReminderCommand }
  | { entity: 'school-year'; command: SchoolYearCommand };

export function isSupportedEditChangeLog(log: ChangeLog): boolean {
  return (
    log.commandType.startsWith(CATEGORY_COMMAND_PREFIX) ||
    log.commandType.startsWith(CALENDAR_EVENT_COMMAND_PREFIX) ||
    log.commandType.startsWith(SCHEDULE_BLOCK_COMMAND_PREFIX) ||
    log.commandType.startsWith(SCHEDULE_EXCEPTION_COMMAND_PREFIX) ||
    log.commandType.startsWith(PLANNING_COMMAND_PREFIX) ||
    log.commandType.startsWith(LEARNER_CONTEXT_COMMAND_PREFIX) ||
    log.commandType.startsWith(LEARNER_NOTICE_COMMAND_PREFIX) ||
    log.commandType.startsWith(LIBRARY_CATALOG_COMMAND_PREFIX) ||
    log.commandType.startsWith(TASK_COMMAND_PREFIX) ||
    log.commandType.startsWith(REMINDER_COMMAND_PREFIX) ||
    log.commandType.startsWith(SCHOOL_YEAR_COMMAND_PREFIX)
  );
}

export function parseSupportedEditCommand(commandType: string, json: string): SupportedEditCommand {
  if (commandType.startsWith(CATEGORY_COMMAND_PREFIX)) {
    return {
      entity: 'category',
      command: parseCategoryCommand(json),
    };
  }
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
  if (commandType.startsWith(LEARNER_NOTICE_COMMAND_PREFIX)) {
    return {
      entity: 'learner-notice',
      command: parseLearnerNoticeCommand(json),
    };
  }
  if (commandType.startsWith(LIBRARY_CATALOG_COMMAND_PREFIX)) {
    return {
      entity: 'library-catalog',
      command: parseLibraryCatalogCommand(json),
    };
  }
  if (commandType.startsWith(TASK_COMMAND_PREFIX)) {
    return {
      entity: 'task',
      command: parseTaskCommand(json),
    };
  }
  if (commandType.startsWith(REMINDER_COMMAND_PREFIX)) {
    return {
      entity: 'reminder',
      command: parseReminderCommand(json),
    };
  }
  if (commandType.startsWith(SCHOOL_YEAR_COMMAND_PREFIX)) {
    return {
      entity: 'school-year',
      command: parseSchoolYearCommand(json),
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
  if (parsed.entity === 'category') {
    for (const operation of parsed.command.operations) {
      if (operation.table === 'categoryValues') {
        if (operation.action === 'put') await db.categoryValues.put(operation.record);
        else await db.categoryValues.delete(operation.id);
      } else if (operation.action === 'put') {
        await db.categoryAssignments.put(operation.record);
      } else {
        await db.categoryAssignments.delete(operation.id);
      }
    }
    return;
  }
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

  if (parsed.entity === 'learner-notice') {
    for (const operation of parsed.command.operations) {
      if (operation.table === 'learnerNotices') {
        if (operation.action === 'put') await db.learnerNotices.put(operation.record);
        else await db.learnerNotices.delete(operation.id);
      } else if (operation.table === 'learnerServiceOccurrences') {
        if (operation.action === 'put') {
          await db.learnerServiceOccurrences.put(operation.record);
        } else {
          await db.learnerServiceOccurrences.delete(operation.id);
        }
      } else if (operation.table === 'tasks') {
        if (operation.action === 'put') await db.tasks.put(operation.record);
        else await db.tasks.delete(operation.id);
      } else if (operation.action === 'put') {
        await db.categoryAssignments.put(operation.record);
      } else {
        await db.categoryAssignments.delete(operation.id);
      }
    }
    return;
  }

  if (parsed.entity === 'library-catalog') {
    for (const operation of parsed.command.operations) {
      if (operation.table === 'libraryItems') {
        if (operation.action === 'put') {
          await db.libraryItems.put(operation.record);
        } else {
          await db.libraryItems.delete(operation.id);
        }
      } else if (operation.action === 'put') {
        await db.categoryAssignments.put(operation.record);
      } else {
        await db.categoryAssignments.delete(operation.id);
      }
    }
    return;
  }

  if (parsed.entity === 'task') {
    for (const operation of parsed.command.operations) {
      if (operation.table === 'tasks') {
        if (operation.action === 'put') await db.tasks.put(operation.record);
        else await db.tasks.delete(operation.id);
      } else if (operation.action === 'put') {
        await db.categoryAssignments.put(operation.record);
      } else {
        await db.categoryAssignments.delete(operation.id);
      }
    }
    return;
  }

  if (parsed.entity === 'reminder') {
    for (const operation of parsed.command.operations) {
      if (operation.action === 'put') await db.reminders.put(operation.record);
      else await db.reminders.delete(operation.id);
    }
    return;
  }

  if (parsed.entity === 'school-year') {
    for (const operation of parsed.command.operations) {
      if (operation.action === 'put') await db.schoolYears.put(operation.record);
      else await db.schoolYears.delete(operation.id);
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
      } else if (operation.table === 'sessionOccurrences') {
        if (operation.action === 'put') await db.sessionOccurrences.put(operation.record);
        else await db.sessionOccurrences.delete(operation.id);
      } else if (operation.action === 'put') {
        await db.categoryAssignments.put(operation.record);
      } else {
        await db.categoryAssignments.delete(operation.id);
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
