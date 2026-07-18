import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  calendarEventSchema,
  changeLogSchema,
  type CalendarEvent,
  type ChangeLog,
} from '@/domain/models/entities';

import {
  deleteCalendarEventCommand,
  putCalendarEventCommand,
  serializeCalendarEventCommand,
  type CalendarEventCommandPair,
} from './calendarEventCommands';
import {
  parseCalendarEventEditorValues,
  type CalendarEventEditorValues,
} from './calendarEventEditorModel';
import { clearSupportedRedoBranch } from './editCommandRegistry';
import { notifyEditHistoryChanged } from './editHistorySignal';

export interface CalendarEventMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

export class CalendarEventMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: CalendarEventMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(values: CalendarEventEditorValues): Promise<CalendarEvent> {
    const fields = parseCalendarEventEditorValues(values);
    const record = calendarEventSchema.parse({
      id: this.createId(),
      ...fields,
      source: 'user',
    });
    const log = await this.commit('calendar-event.create', `Create “${record.title}”`, {
      forward: putCalendarEventCommand(record),
      inverse: deleteCalendarEventCommand(record.id),
    });
    this.notifyNewChange(log);
    return record;
  }

  async update(id: string, values: CalendarEventEditorValues): Promise<CalendarEvent> {
    const fields = parseCalendarEventEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      this.db.calendarEvents,
      this.db.changeLog,
      async () => {
        const existingValue = await this.db.calendarEvents.get(id);
        if (!existingValue) throw new Error('Calendar event no longer exists.');
        const existing = calendarEventSchema.parse(existingValue);
        const updated = calendarEventSchema.parse({
          ...existing,
          ...fields,
          id,
        });
        const log = this.createChangeLog('calendar-event.update', `Edit “${updated.title}”`, {
          forward: putCalendarEventCommand(updated),
          inverse: putCalendarEventCommand(existing),
        });

        await clearSupportedRedoBranch(this.db);
        await this.db.calendarEvents.put(updated);
        await this.db.changeLog.put(log);
        return { updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.updated;
  }

  async delete(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.calendarEvents,
      this.db.changeLog,
      async () => {
        const existingValue = await this.db.calendarEvents.get(id);
        if (!existingValue) throw new Error('Calendar event no longer exists.');
        const existing = calendarEventSchema.parse(existingValue);
        const nextLog = this.createChangeLog(
          'calendar-event.delete',
          `Delete “${existing.title}”`,
          {
            forward: deleteCalendarEventCommand(id),
            inverse: putCalendarEventCommand(existing),
          },
        );

        await clearSupportedRedoBranch(this.db);
        await this.db.calendarEvents.delete(id);
        await this.db.changeLog.put(nextLog);
        return nextLog;
      },
    );

    this.notifyNewChange(log);
  }

  private async commit(
    commandType: string,
    label: string,
    commands: CalendarEventCommandPair,
  ): Promise<ChangeLog> {
    return this.db.transaction('rw', this.db.calendarEvents, this.db.changeLog, async () => {
      await clearSupportedRedoBranch(this.db);
      const forward = commands.forward;
      if (forward.action === 'put') {
        if (
          commandType === 'calendar-event.create' &&
          (await this.db.calendarEvents.get(forward.record.id))
        ) {
          throw new Error('Calendar event ID already exists.');
        }
        await this.db.calendarEvents.put(forward.record);
      } else {
        await this.db.calendarEvents.delete(forward.id);
      }

      const log = this.createChangeLog(commandType, label, commands);
      await this.db.changeLog.put(log);
      return log;
    });
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: CalendarEventCommandPair,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeCalendarEventCommand(commands.forward),
      inverseJson: serializeCalendarEventCommand(commands.inverse),
      createdAt: this.now(),
    });
  }

  private notifyNewChange(log: ChangeLog): void {
    notifyEditHistoryChanged({
      canUndo: true,
      canRedo: false,
      undoLabel: log.label,
    });
  }
}

export const calendarEventMutationService = new CalendarEventMutationService();
