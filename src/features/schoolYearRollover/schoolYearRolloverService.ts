import type { Table } from 'dexie';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  contextMembershipSchema,
  learnerContextSchema,
  scheduleBlockSchema,
  schoolYearSchema,
  type BackupSnapshot,
  type ChangeLog,
} from '@/domain/models/entities';
import { BACKUP_TABLE_NAMES, type BackupTableName } from '@/features/backupRecovery/backupFormat';
import {
  createSafetySnapshotRecord,
  pruneSafetySnapshots,
} from '@/features/backupRecovery/backupService';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import { applySchoolYearRolloverOperations } from './applySchoolYearRolloverOperations';
import {
  createSchoolYearRolloverCommand,
  deleteRolloverContextMembership,
  deleteRolloverLearnerContext,
  deleteRolloverScheduleBlock,
  putRolloverContextMembership,
  putRolloverLearnerContext,
  putRolloverScheduleBlock,
  serializeSchoolYearRolloverCommand,
  type SchoolYearRolloverCommandPair,
} from './schoolYearRolloverCommands';
import {
  buildSchoolYearRolloverPreview,
  rolloverBaselineHash,
  type SchoolYearRolloverData,
  type SchoolYearRolloverPreview,
  type SchoolYearRolloverRequest,
} from './schoolYearRolloverModel';

export interface SchoolYearRolloverDependencies {
  createId?: () => string;
  now?: () => string;
}

export interface SchoolYearRolloverCommitResult {
  safetySnapshot: BackupSnapshot;
  changeLog: ChangeLog;
  createdContextCount: number;
  createdMembershipCount: number;
  createdScheduleBlockCount: number;
}

function tableFor(db: ClassroomDatabase, tableName: BackupTableName): Table<unknown, string> {
  return db.table(tableName) as Table<unknown, string>;
}

export function schoolYearRolloverError(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The school year rollover could not be completed.';
}

export class SchoolYearRolloverService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: SchoolYearRolloverDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async loadData(): Promise<SchoolYearRolloverData> {
    const [schoolYears, learnerContexts, contextMemberships, scheduleBlocks] = await Promise.all([
      this.db.schoolYears.toArray(),
      this.db.learnerContexts.toArray(),
      this.db.contextMemberships.toArray(),
      this.db.scheduleBlocks.toArray(),
    ]);
    return {
      schoolYears: schoolYears.map((value) => schoolYearSchema.parse(value)),
      learnerContexts: learnerContexts.map((value) => learnerContextSchema.parse(value)),
      contextMemberships: contextMemberships.map((value) => contextMembershipSchema.parse(value)),
      scheduleBlocks: scheduleBlocks.map((value) => scheduleBlockSchema.parse(value)),
    };
  }

  async preview(request: SchoolYearRolloverRequest): Promise<SchoolYearRolloverPreview> {
    const data = await this.db.transaction(
      'r',
      [
        this.db.schoolYears,
        this.db.learnerContexts,
        this.db.contextMemberships,
        this.db.scheduleBlocks,
      ],
      () => this.loadData(),
    );
    return buildSchoolYearRolloverPreview(request, data, { createId: this.createId });
  }

  async commit(preview: SchoolYearRolloverPreview): Promise<SchoolYearRolloverCommitResult> {
    if (!preview.canCommit) {
      throw new Error('Resolve every rollover issue and generate a new reviewed preview first.');
    }
    const transactionTables = [
      ...BACKUP_TABLE_NAMES.map((tableName) => tableFor(this.db, tableName)),
      this.db.backupSnapshots,
    ];

    const result = await this.db.transaction('rw', transactionTables, async () => {
      const currentData = await this.loadData();
      if (rolloverBaselineHash(currentData) !== preview.baselineHash) {
        throw new Error('School-year, learner, or Schedule data changed. Generate a new preview.');
      }
      const sourceYear = currentData.schoolYears.find(
        (schoolYear) => schoolYear.id === preview.sourceSchoolYear.id,
      );
      const targetYear = currentData.schoolYears.find(
        (schoolYear) => schoolYear.id === preview.targetSchoolYear.id,
      );
      if (!sourceYear || !targetYear) throw new Error('A selected school year no longer exists.');
      if (sourceYear.lifecycleState === 'archived' || targetYear.lifecycleState === 'archived') {
        throw new Error('Restore both school years before committing rollover.');
      }

      const commands: SchoolYearRolloverCommandPair = {
        forward: createSchoolYearRolloverCommand([
          ...preview.createdContexts.map(putRolloverLearnerContext),
          ...preview.createdMemberships.map(putRolloverContextMembership),
          ...preview.createdScheduleBlocks.map(putRolloverScheduleBlock),
        ]),
        inverse: createSchoolYearRolloverCommand([
          ...[...preview.createdScheduleBlocks]
            .reverse()
            .map((block) => deleteRolloverScheduleBlock(block.id)),
          ...[...preview.createdMemberships]
            .reverse()
            .map((membership) => deleteRolloverContextMembership(membership.id)),
          ...[...preview.createdContexts]
            .reverse()
            .map((context) => deleteRolloverLearnerContext(context.id)),
        ]),
      };
      const createdAt = this.now();
      const safetySnapshot = await createSafetySnapshotRecord(this.db, {
        kind: 'pre-rollover',
        createId: this.createId,
        createdAt,
      });
      const changeLog = changeLogSchema.parse({
        id: this.createId(),
        label: `Roll over ${preview.contextRows.length} learner context${
          preview.contextRows.length === 1 ? '' : 's'
        } from ${preview.sourceSchoolYear.label} to ${preview.targetSchoolYear.label}`,
        commandType: 'school-year-rollover.commit',
        forwardJson: serializeSchoolYearRolloverCommand(commands.forward),
        inverseJson: serializeSchoolYearRolloverCommand(commands.inverse),
        createdAt,
      });

      await this.db.backupSnapshots.put(safetySnapshot);
      await clearSupportedRedoBranch(this.db);
      await applySchoolYearRolloverOperations(this.db, commands.forward.operations);
      await this.db.changeLog.put(changeLog);
      await pruneSafetySnapshots(this.db);

      return {
        safetySnapshot,
        changeLog,
        createdContextCount: preview.createdContexts.length,
        createdMembershipCount: preview.createdMemberships.length,
        createdScheduleBlockCount: preview.createdScheduleBlocks.length,
      };
    });

    notifyEditHistoryChanged({
      canUndo: true,
      canRedo: false,
      undoLabel: result.changeLog.label,
    });
    return result;
  }
}

export const schoolYearRolloverService = new SchoolYearRolloverService();
