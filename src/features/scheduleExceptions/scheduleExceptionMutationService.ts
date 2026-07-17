import { getISODay } from 'date-fns';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  scheduleBlockSchema,
  scheduleExceptionSchema,
  type ChangeLog,
  type ScheduleBlock,
  type ScheduleException,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';
import { parseLocalDate, shiftDays } from '@/shared/dates/localDate';

import {
  createScheduleExceptionCommand,
  serializeScheduleExceptionCommand,
  type ScheduleExceptionCommandPair,
  type ScheduleExceptionOperation,
} from './scheduleExceptionCommands';
import {
  parseScheduleExceptionEditorValues,
  type ScheduleExceptionEditorValues,
} from './scheduleExceptionEditorModel';

export interface ScheduleExceptionMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

function operationPutBlock(record: ScheduleBlock): ScheduleExceptionOperation {
  return { table: 'scheduleBlocks', action: 'put', record };
}

function operationDeleteBlock(id: string): ScheduleExceptionOperation {
  return { table: 'scheduleBlocks', action: 'delete', id };
}

function operationPutException(record: ScheduleException): ScheduleExceptionOperation {
  return { table: 'scheduleExceptions', action: 'put', record };
}

function operationDeleteException(id: string): ScheduleExceptionOperation {
  return { table: 'scheduleExceptions', action: 'delete', id };
}

export class ScheduleExceptionMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: ScheduleExceptionMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async saveOccurrence(
    blockId: string,
    date: string,
    values: ScheduleExceptionEditorValues,
  ): Promise<ScheduleException> {
    const fields = parseScheduleExceptionEditorValues(values);
    this.assertDate(date);

    const result = await this.db.transaction(
      'rw',
      this.db.scheduleBlocks,
      this.db.scheduleExceptions,
      this.db.changeLog,
      async (): Promise<CommitResult<ScheduleException>> => {
        const block = await this.requireActiveBlock(blockId);
        this.assertOccurrence(block, date);
        const existing = await this.findSingleException(blockId, date);
        const record = scheduleExceptionSchema.parse({
          id: existing?.id ?? this.createId(),
          date,
          scheduleBlockId: block.id,
          action: 'modify',
          replacementTitle: fields.title,
          replacementStartMinute: fields.startMinute,
          replacementEndMinute: fields.endMinute,
          reason: fields.reason,
        });
        const commands: ScheduleExceptionCommandPair = {
          forward: createScheduleExceptionCommand([operationPutException(record)]),
          inverse: createScheduleExceptionCommand([
            existing ? operationPutException(existing) : operationDeleteException(record.id),
          ]),
        };
        const log = this.createChangeLog(
          'schedule-exception.modify',
          `Adjust “${block.title}” on ${date}`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.db.scheduleExceptions.put(record);
        await this.db.changeLog.put(log);
        return { value: record, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async cancelOccurrence(
    blockId: string,
    date: string,
    reason?: string,
  ): Promise<ScheduleException> {
    this.assertDate(date);

    const result = await this.db.transaction(
      'rw',
      this.db.scheduleBlocks,
      this.db.scheduleExceptions,
      this.db.changeLog,
      async (): Promise<CommitResult<ScheduleException>> => {
        const block = await this.requireActiveBlock(blockId);
        this.assertOccurrence(block, date);
        const existing = await this.findSingleException(blockId, date);
        const record = scheduleExceptionSchema.parse({
          id: existing?.id ?? this.createId(),
          date,
          scheduleBlockId: block.id,
          action: 'cancel',
          reason: reason?.trim() || undefined,
        });
        const commands: ScheduleExceptionCommandPair = {
          forward: createScheduleExceptionCommand([operationPutException(record)]),
          inverse: createScheduleExceptionCommand([
            existing ? operationPutException(existing) : operationDeleteException(record.id),
          ]),
        };
        const log = this.createChangeLog(
          'schedule-exception.cancel',
          `Cancel “${block.title}” on ${date}`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.db.scheduleExceptions.put(record);
        await this.db.changeLog.put(log);
        return { value: record, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  async restoreDefault(blockId: string, date: string): Promise<void> {
    this.assertDate(date);

    const log = await this.db.transaction(
      'rw',
      this.db.scheduleExceptions,
      this.db.changeLog,
      async () => {
        const existing = await this.findSingleException(blockId, date);
        if (!existing) throw new Error('This occurrence already uses the default schedule.');
        const commands: ScheduleExceptionCommandPair = {
          forward: createScheduleExceptionCommand([operationDeleteException(existing.id)]),
          inverse: createScheduleExceptionCommand([operationPutException(existing)]),
        };
        const nextLog = this.createChangeLog(
          'schedule-exception.restore',
          `Restore default on ${date}`,
          commands,
        );
        await clearSupportedRedoBranch(this.db);
        await this.db.scheduleExceptions.delete(existing.id);
        await this.db.changeLog.put(nextLog);
        return nextLog;
      },
    );

    this.notifyNewChange(log);
  }

  async splitFuture(
    blockId: string,
    boundaryDate: string,
    values: ScheduleExceptionEditorValues,
  ): Promise<ScheduleBlock> {
    const fields = parseScheduleExceptionEditorValues(values);
    this.assertDate(boundaryDate);

    const result = await this.db.transaction(
      'rw',
      this.db.scheduleBlocks,
      this.db.scheduleExceptions,
      this.db.changeLog,
      async (): Promise<CommitResult<ScheduleBlock>> => {
        const blocks = await this.readBlocks();
        const block = blocks.find((candidate) => candidate.id === blockId);
        if (!block) throw new Error('Schedule block no longer exists.');
        if (block.archivedAt) throw new Error('Archived schedule blocks cannot be split.');
        if (block.effectiveFrom && boundaryDate <= block.effectiveFrom) {
          throw new Error('Use Entire default when the change begins at the block start.');
        }
        if (block.effectiveTo && boundaryDate > block.effectiveTo) {
          throw new Error('The selected date is outside this schedule block.');
        }
        const boundary = parseLocalDate(boundaryDate);
        if (!boundary || !block.weekdays.includes(getISODay(boundary))) {
          throw new Error('This date is not an occurrence of the selected schedule block.');
        }

        const activeChildren = blocks.filter(
          (candidate) =>
            candidate.parentId === block.id &&
            !candidate.archivedAt &&
            (!candidate.effectiveTo || candidate.effectiveTo >= boundaryDate),
        );
        if (activeChildren.length > 0) {
          throw new Error(
            'This and future is not available for a parent block with active children. Edit child blocks individually or use Entire default.',
          );
        }

        const futureId = this.createId();
        const priorDate = shiftDays(boundaryDate, -1);
        const truncated = scheduleBlockSchema.parse({
          ...block,
          effectiveTo: priorDate,
        });
        const future = scheduleBlockSchema.parse({
          ...block,
          id: futureId,
          effectiveFrom: boundaryDate,
          effectiveTo: block.effectiveTo,
          title: fields.title,
          startMinute: fields.startMinute,
          endMinute: fields.endMinute,
        });

        const forward: ScheduleExceptionOperation[] = [
          operationPutBlock(truncated),
          operationPutBlock(future),
        ];
        const inverse: ScheduleExceptionOperation[] = [
          operationDeleteBlock(future.id),
          operationPutBlock(block),
        ];

        const exceptions = await this.readExceptions();
        for (const exception of exceptions) {
          if (exception.scheduleBlockId !== block.id || exception.date < boundaryDate) continue;

          if (exception.date === boundaryDate) {
            forward.push(operationDeleteException(exception.id));
            inverse.unshift(operationPutException(exception));
            continue;
          }

          const migrated = scheduleExceptionSchema.parse({
            ...exception,
            scheduleBlockId: future.id,
          });
          forward.push(operationPutException(migrated));
          inverse.unshift(operationPutException(exception));
        }

        const commands: ScheduleExceptionCommandPair = {
          forward: createScheduleExceptionCommand(forward),
          inverse: createScheduleExceptionCommand(inverse),
        };
        const log = this.createChangeLog(
          'schedule-exception.split-future',
          `Change “${block.title}” from ${boundaryDate}`,
          commands,
        );

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(forward);
        await this.db.changeLog.put(log);
        return { value: future, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.value;
  }

  private assertDate(date: string): void {
    if (!parseLocalDate(date)) throw new Error(`Invalid local date: ${date}`);
  }

  private assertOccurrence(block: ScheduleBlock, date: string): void {
    const parsed = parseLocalDate(date);
    if (!parsed) throw new Error(`Invalid local date: ${date}`);
    if (block.effectiveFrom && date < block.effectiveFrom) {
      throw new Error('This date is outside this schedule block.');
    }
    if (block.effectiveTo && date > block.effectiveTo) {
      throw new Error('This date is outside this schedule block.');
    }
    if (!block.weekdays.includes(getISODay(parsed))) {
      throw new Error('This date is not an occurrence of the selected schedule block.');
    }
  }

  private async requireActiveBlock(id: string): Promise<ScheduleBlock> {
    const value = await this.db.scheduleBlocks.get(id);
    if (!value) throw new Error('Schedule block no longer exists.');
    const block = scheduleBlockSchema.parse(value);
    if (block.archivedAt) throw new Error('Archived schedule blocks cannot be edited.');
    return block;
  }

  private async findSingleException(
    blockId: string,
    date: string,
  ): Promise<ScheduleException | undefined> {
    const values = await this.db.scheduleExceptions.where('date').equals(date).toArray();
    const matches = values
      .map((value) => scheduleExceptionSchema.parse(value))
      .filter((exception) => exception.scheduleBlockId === blockId);
    if (matches.length > 1) {
      throw new Error('Multiple schedule exceptions exist for this block and date.');
    }
    return matches[0];
  }

  private async readBlocks(): Promise<ScheduleBlock[]> {
    return (await this.db.scheduleBlocks.toArray()).map((value) =>
      scheduleBlockSchema.parse(value),
    );
  }

  private async readExceptions(): Promise<ScheduleException[]> {
    return (await this.db.scheduleExceptions.toArray()).map((value) =>
      scheduleExceptionSchema.parse(value),
    );
  }

  private async applyOperations(operations: readonly ScheduleExceptionOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.table === 'scheduleBlocks') {
        if (operation.action === 'put') await this.db.scheduleBlocks.put(operation.record);
        else await this.db.scheduleBlocks.delete(operation.id);
      } else if (operation.action === 'put') {
        await this.db.scheduleExceptions.put(operation.record);
      } else {
        await this.db.scheduleExceptions.delete(operation.id);
      }
    }
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: ScheduleExceptionCommandPair,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeScheduleExceptionCommand(commands.forward),
      inverseJson: serializeScheduleExceptionCommand(commands.inverse),
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

export const scheduleExceptionMutationService = new ScheduleExceptionMutationService();
