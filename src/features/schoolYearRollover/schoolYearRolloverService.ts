import type { Table } from 'dexie';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  categoryAssignmentSchema,
  changeLogSchema,
  learnerContextSchema,
  lessonPlanSchema,
  lessonSeriesSchema,
  scheduleBlockSchema,
  schoolYearSchema,
  standardAlignmentSchema,
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
  deleteRolloverCategoryAssignment,
  deleteRolloverLearnerContext,
  deleteRolloverLessonPlan,
  deleteRolloverLessonSeries,
  deleteRolloverScheduleBlock,
  deleteRolloverStandardAlignment,
  putRolloverCategoryAssignment,
  putRolloverLearnerContext,
  putRolloverLessonPlan,
  putRolloverLessonSeries,
  putRolloverScheduleBlock,
  putRolloverStandardAlignment,
  serializeSchoolYearRolloverCommand,
  type SchoolYearRolloverCommandPair,
} from './schoolYearRolloverCommands';
import {
  buildSchoolYearRolloverPreview,
  rolloverBaselineHash,
  schoolYearDatesUnchanged,
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
  createdSeriesCount: number;
  createdPlanCount: number;
  createdScheduleBlockCount: number;
  createdStandardAlignmentCount: number;
  createdCategoryAssignmentCount: number;
}

function tableFor(db: ClassroomDatabase, tableName: BackupTableName): Table<unknown, string> {
  return db.table(tableName) as Table<unknown, string>;
}

export function schoolYearRolloverError(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The instructional rollover could not be completed.';
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
    const [
      schoolYears,
      learnerContexts,
      scheduleBlocks,
      lessonSeries,
      lessonPlans,
      standardAlignments,
      categoryAssignments,
    ] = await Promise.all([
      this.db.schoolYears.toArray(),
      this.db.learnerContexts.toArray(),
      this.db.scheduleBlocks.toArray(),
      this.db.lessonSeries.toArray(),
      this.db.lessonPlans.toArray(),
      this.db.standardAlignments.toArray(),
      this.db.categoryAssignments.toArray(),
    ]);

    return {
      schoolYears: schoolYears.map((value) => schoolYearSchema.parse(value)),
      learnerContexts: learnerContexts.map((value) => learnerContextSchema.parse(value)),
      scheduleBlocks: scheduleBlocks.map((value) => scheduleBlockSchema.parse(value)),
      lessonSeries: lessonSeries.map((value) => lessonSeriesSchema.parse(value)),
      lessonPlans: lessonPlans.map((value) => lessonPlanSchema.parse(value)),
      standardAlignments: standardAlignments.map((value) => standardAlignmentSchema.parse(value)),
      categoryAssignments: categoryAssignments.map((value) =>
        categoryAssignmentSchema.parse(value),
      ),
    };
  }

  async preview(request: SchoolYearRolloverRequest): Promise<SchoolYearRolloverPreview> {
    const data = await this.db.transaction(
      'r',
      [
        this.db.schoolYears,
        this.db.learnerContexts,
        this.db.scheduleBlocks,
        this.db.lessonSeries,
        this.db.lessonPlans,
        this.db.standardAlignments,
        this.db.categoryAssignments,
      ],
      () => this.loadData(),
    );
    return buildSchoolYearRolloverPreview(request, data, {
      createId: this.createId,
      now: this.now,
    });
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
        throw new Error('School-year or instructional data changed. Generate a new preview.');
      }
      if (!schoolYearDatesUnchanged(preview, currentData.schoolYears)) {
        throw new Error('School year dates or activation changed. Generate a new preview.');
      }

      const commands: SchoolYearRolloverCommandPair = {
        forward: createSchoolYearRolloverCommand([
          ...preview.createdContexts.map(putRolloverLearnerContext),
          ...preview.createdSeries.map(putRolloverLessonSeries),
          ...preview.createdScheduleBlocks.map(putRolloverScheduleBlock),
          ...preview.createdPlans.map(putRolloverLessonPlan),
          ...preview.createdStandardAlignments.map(putRolloverStandardAlignment),
          ...preview.createdCategoryAssignments.map(putRolloverCategoryAssignment),
        ]),
        inverse: createSchoolYearRolloverCommand([
          ...[...preview.createdCategoryAssignments]
            .reverse()
            .map((record) => deleteRolloverCategoryAssignment(record.id)),
          ...[...preview.createdStandardAlignments]
            .reverse()
            .map((record) => deleteRolloverStandardAlignment(record.id)),
          ...[...preview.createdPlans]
            .reverse()
            .map((record) => deleteRolloverLessonPlan(record.id)),
          ...[...preview.createdScheduleBlocks]
            .reverse()
            .map((record) => deleteRolloverScheduleBlock(record.id)),
          ...[...preview.createdSeries]
            .reverse()
            .map((record) => deleteRolloverLessonSeries(record.id)),
          ...[...preview.createdContexts]
            .reverse()
            .map((record) => deleteRolloverLearnerContext(record.id)),
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
        label: `Roll over ${preview.createdPlans.length} Lesson Plan${
          preview.createdPlans.length === 1 ? '' : 's'
        } from ${preview.sourceSchoolYear.label} to ${preview.targetSchoolYear.label}`,
        commandType: 'school-year-rollover.instructional-commit',
        forwardJson: serializeSchoolYearRolloverCommand(commands.forward),
        inverseJson: serializeSchoolYearRolloverCommand(commands.inverse),
        createdAt,
      });

      await this.db.backupSnapshots.put(safetySnapshot);
      await clearSupportedRedoBranch(this.db);
      await applySchoolYearRolloverOperations(this.db, commands.forward.operations);

      const yearsAfterWrite = await this.db.schoolYears.toArray();
      if (
        !schoolYearDatesUnchanged(
          preview,
          yearsAfterWrite.map((value) => schoolYearSchema.parse(value)),
        )
      ) {
        throw new Error('Rollover attempted to change School Year boundaries.');
      }

      await this.db.changeLog.put(changeLog);
      await pruneSafetySnapshots(this.db);

      return {
        safetySnapshot,
        changeLog,
        createdContextCount: preview.createdContexts.length,
        createdSeriesCount: preview.createdSeries.length,
        createdPlanCount: preview.createdPlans.length,
        createdScheduleBlockCount: preview.createdScheduleBlocks.length,
        createdStandardAlignmentCount: preview.createdStandardAlignments.length,
        createdCategoryAssignmentCount: preview.createdCategoryAssignments.length,
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
