import { z } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  reminderSchema,
  type ChangeLog,
  type Reminder,
  type ReminderSourceType,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import {
  createReminderCommand,
  deleteReminderOperation,
  putReminderOperation,
  serializeReminderCommand,
  type ReminderCommandPair,
  type ReminderOperation,
} from './reminderCommands';

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().max(1000).optional());

const minuteInputSchema = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().int().min(0).max(1439));

export const reminderEditorValuesSchema = z.object({
  sourceType: z.enum(['task', 'session', 'calendar-event', 'learner-notice']),
  sourceId: z.string().trim().min(1),
  remindDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Reminder date must use YYYY-MM-DD.'),
  remindMinute: minuteInputSchema,
  note: optionalTrimmedString,
});

export const reminderScheduleValuesSchema = z.object({
  remindDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Reminder date must use YYYY-MM-DD.'),
  remindMinute: minuteInputSchema,
  note: optionalTrimmedString,
});

export type ReminderEditorValues = z.input<typeof reminderEditorValuesSchema>;
export type ReminderScheduleValues = z.input<typeof reminderScheduleValuesSchema>;

export interface ReminderMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export class ReminderMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: ReminderMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(values: ReminderEditorValues): Promise<Reminder> {
    const parsed = reminderEditorValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.reminders,
      this.db.tasks,
      this.db.sessionOccurrences,
      this.db.calendarEvents,
      this.db.changeLog,
      async (): Promise<CommitResult<Reminder>> => {
        await this.requireSource(parsed.sourceType, parsed.sourceId);
        const now = this.now();
        const reminder = reminderSchema.parse({
          id: this.createId(),
          ...parsed,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        const commands: ReminderCommandPair = {
          forward: createReminderCommand([putReminderOperation(reminder)]),
          inverse: createReminderCommand([deleteReminderOperation(reminder.id)]),
        };
        const log = this.createChangeLog(
          'reminder.create',
          `Create reminder for ${this.sourceTypeLabel(reminder.sourceType)}`,
          commands,
          now,
        );
        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: reminder, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(id: string, values: ReminderScheduleValues): Promise<Reminder> {
    const parsed = reminderScheduleValuesSchema.parse(values);
    return this.replace(id, 'reminder.update', 'Edit reminder', (existing, now) => ({
      ...existing,
      ...parsed,
      updatedAt: now,
    }));
  }

  async dismiss(id: string): Promise<Reminder> {
    return this.replace(id, 'reminder.dismiss', 'Dismiss reminder', (existing, now) => {
      if (existing.status !== 'active') throw new Error('Only active reminders can be dismissed.');
      return {
        ...existing,
        status: 'dismissed',
        dismissedAt: now,
        updatedAt: now,
      };
    });
  }

  async snooze(id: string, values: ReminderScheduleValues): Promise<Reminder> {
    const parsed = reminderScheduleValuesSchema.parse(values);
    return this.replace(id, 'reminder.snooze', 'Snooze reminder', (existing, now) => {
      if (existing.status !== 'active') throw new Error('Only active reminders can be snoozed.');
      return {
        ...existing,
        ...parsed,
        status: 'active',
        dismissedAt: undefined,
        snoozedAt: now,
        updatedAt: now,
      };
    });
  }

  async restore(id: string): Promise<Reminder> {
    return this.replace(id, 'reminder.restore', 'Restore reminder', (existing, now) => {
      if (existing.status !== 'dismissed') {
        throw new Error('Only dismissed reminders can be restored.');
      }
      return {
        ...existing,
        status: 'active',
        dismissedAt: undefined,
        updatedAt: now,
      };
    });
  }

  async delete(id: string): Promise<void> {
    const log = await this.db.transaction('rw', this.db.reminders, this.db.changeLog, async () => {
      const existing = await this.requireReminder(id);
      const now = this.now();
      const commands: ReminderCommandPair = {
        forward: createReminderCommand([deleteReminderOperation(existing.id)]),
        inverse: createReminderCommand([putReminderOperation(existing)]),
      };
      const nextLog = this.createChangeLog(
        'reminder.delete',
        `Delete reminder for ${this.sourceTypeLabel(existing.sourceType)}`,
        commands,
        now,
      );
      await clearSupportedRedoBranch(this.db);
      await this.applyOperations(commands.forward.operations);
      await this.db.changeLog.put(nextLog);
      return nextLog;
    });

    this.notifyNewChange(log);
  }

  private async replace(
    id: string,
    commandType: string,
    label: string,
    update: (existing: Reminder, now: string) => Reminder,
  ): Promise<Reminder> {
    const result = await this.db.transaction(
      'rw',
      this.db.reminders,
      this.db.changeLog,
      async (): Promise<CommitResult<Reminder>> => {
        const existing = await this.requireReminder(id);
        const now = this.now();
        const updated = reminderSchema.parse(update(existing, now));
        const commands: ReminderCommandPair = {
          forward: createReminderCommand([putReminderOperation(updated)]),
          inverse: createReminderCommand([putReminderOperation(existing)]),
        };
        const log = this.createChangeLog(commandType, label, commands, now);
        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  private async requireSource(sourceType: ReminderSourceType, sourceId: string): Promise<void> {
    if (sourceType === 'task') {
      if (!(await this.db.tasks.get(sourceId))) throw new Error('Task source not found.');
      return;
    }
    if (sourceType === 'session') {
      if (!(await this.db.sessionOccurrences.get(sourceId))) {
        throw new Error('Session source not found.');
      }
      return;
    }
    if (sourceType === 'calendar-event') {
      if (!(await this.db.calendarEvents.get(sourceId))) {
        throw new Error('Calendar event source not found.');
      }
      return;
    }
    throw new Error('Learner Notice reminders will be enabled with Learner Support & Notices.');
  }

  private async requireReminder(id: string): Promise<Reminder> {
    const reminder = await this.db.reminders.get(id);
    if (!reminder) throw new Error('Reminder not found.');
    return reminderSchema.parse(reminder);
  }

  private async applyOperations(operations: readonly ReminderOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.action === 'put') await this.db.reminders.put(operation.record);
      else await this.db.reminders.delete(operation.id);
    }
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: ReminderCommandPair,
    createdAt: string,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeReminderCommand(commands.forward),
      inverseJson: serializeReminderCommand(commands.inverse),
      createdAt,
    });
  }

  private sourceTypeLabel(sourceType: ReminderSourceType): string {
    if (sourceType === 'task') return 'task';
    if (sourceType === 'session') return 'session';
    if (sourceType === 'calendar-event') return 'calendar event';
    return 'learner notice';
  }

  private notifyNewChange(log: ChangeLog): void {
    notifyEditHistoryChanged({
      canUndo: true,
      canRedo: false,
      undoLabel: log.label,
    });
  }
}

export const reminderMutationService = new ReminderMutationService();
