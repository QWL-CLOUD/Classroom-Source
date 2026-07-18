import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  scheduleBlockSchema,
  type ChangeLog,
  type ScheduleBlock,
} from '@/domain/models/entities';

import { clearSupportedRedoBranch } from './editCommandRegistry';
import { notifyEditHistoryChanged } from './editHistorySignal';
import {
  deleteScheduleBlockCommand,
  putScheduleBlockCommand,
  serializeScheduleBlockCommand,
  type ScheduleBlockCommandPair,
} from './scheduleBlockCommands';
import {
  parseScheduleBlockEditorValues,
  type ScheduleBlockEditorValues,
} from './scheduleBlockEditorModel';
import {
  assertScheduleBlockCanBeArchived,
  assertValidScheduleBlockParent,
} from './scheduleBlockGraph';

export interface ScheduleBlockMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

export class ScheduleBlockMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: ScheduleBlockMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(values: ScheduleBlockEditorValues): Promise<ScheduleBlock> {
    const fields = parseScheduleBlockEditorValues(values);
    const id = this.createId();

    const result = await this.db.transaction(
      'rw',
      this.db.scheduleBlocks,
      this.db.changeLog,
      async () => {
        if (await this.db.scheduleBlocks.get(id))
          throw new Error('Schedule block ID already exists.');

        const blocks = await this.readBlocks();
        assertValidScheduleBlockParent(blocks, id, fields.parentId);
        const nextSortOrder =
          blocks.reduce((highest, block) => Math.max(highest, block.sortOrder), -1) + 1;
        const record = scheduleBlockSchema.parse({
          id,
          subject: '',
          planningEnabled: false,
          bumpEnabled: false,
          sortOrder: nextSortOrder,
          ...fields,
        });
        const log = this.createChangeLog('schedule-block.create', `Create “${record.title}”`, {
          forward: putScheduleBlockCommand(record),
          inverse: deleteScheduleBlockCommand(record.id),
        });

        await clearSupportedRedoBranch(this.db);
        await this.db.scheduleBlocks.put(record);
        await this.db.changeLog.put(log);
        return { record, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.record;
  }

  async update(id: string, values: ScheduleBlockEditorValues): Promise<ScheduleBlock> {
    const fields = parseScheduleBlockEditorValues(values);

    const result = await this.db.transaction(
      'rw',
      this.db.scheduleBlocks,
      this.db.changeLog,
      async () => {
        const existingValue = await this.db.scheduleBlocks.get(id);
        if (!existingValue) throw new Error('Schedule block no longer exists.');
        const existing = scheduleBlockSchema.parse(existingValue);
        if (existing.archivedAt) throw new Error('Archived schedule blocks cannot be edited.');

        const blocks = await this.readBlocks();
        assertValidScheduleBlockParent(blocks, id, fields.parentId);
        const updated = scheduleBlockSchema.parse({
          ...existing,
          ...fields,
          id,
        });
        const log = this.createChangeLog('schedule-block.update', `Edit “${updated.title}”`, {
          forward: putScheduleBlockCommand(updated),
          inverse: putScheduleBlockCommand(existing),
        });

        await clearSupportedRedoBranch(this.db);
        await this.db.scheduleBlocks.put(updated);
        await this.db.changeLog.put(log);
        return { record: updated, log };
      },
    );

    this.notifyNewChange(result.log);
    return result.record;
  }

  async archive(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.scheduleBlocks,
      this.db.changeLog,
      async () => {
        const existingValue = await this.db.scheduleBlocks.get(id);
        if (!existingValue) throw new Error('Schedule block no longer exists.');
        const existing = scheduleBlockSchema.parse(existingValue);
        if (existing.archivedAt) throw new Error('Schedule block is already archived.');

        const blocks = await this.readBlocks();
        assertScheduleBlockCanBeArchived(blocks, id);
        const archived = scheduleBlockSchema.parse({
          ...existing,
          archivedAt: this.now(),
        });
        const nextLog = this.createChangeLog(
          'schedule-block.archive',
          `Archive “${existing.title}”`,
          {
            forward: putScheduleBlockCommand(archived),
            inverse: putScheduleBlockCommand(existing),
          },
        );

        await clearSupportedRedoBranch(this.db);
        await this.db.scheduleBlocks.put(archived);
        await this.db.changeLog.put(nextLog);
        return nextLog;
      },
    );

    this.notifyNewChange(log);
  }

  private async readBlocks(): Promise<ScheduleBlock[]> {
    return (await this.db.scheduleBlocks.toArray()).map((value) =>
      scheduleBlockSchema.parse(value),
    );
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: ScheduleBlockCommandPair,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeScheduleBlockCommand(commands.forward),
      inverseJson: serializeScheduleBlockCommand(commands.inverse),
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

export const scheduleBlockMutationService = new ScheduleBlockMutationService();
