import type { Table } from 'dexie';
import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { migrationRunSchema, type MigrationRun } from '@/domain/models/entities';
import type { MigrationPlanOperation, ReversibleMigrationPlan } from './migrationPlan';

export const writableMigrationTables = [
  'schoolYears',
  'learnerContexts',
  'contextMemberships',
  'scheduleBlocks',
  'calendarEvents',
  'lessonPlans',
  'sessionOccurrences',
  'tasks',
  'quarantineRecords',
] as const;

export type WritableMigrationTable = (typeof writableMigrationTables)[number];

export interface MigrationExecutionTarget {
  targetTable: WritableMigrationTable;
  targetId: string;
  operationId: string;
  recordJson: string;
}

export interface MigrationRestorePointEntry {
  targetTable: WritableMigrationTable;
  targetId: string;
  beforeJson: string | null;
}

export interface MigrationExecutionManifest {
  schemaVersion: 'classroom-v20-migration-execution-v1';
  runId: string;
  planId: string;
  sourceFingerprint: string;
  sourceFormat: string;
  sourceAppVersion?: string;
  restorePointCreatedAt: string;
  committedAt: string;
  rolledBackAt?: string;
  inserted: MigrationExecutionTarget[];
  reused: MigrationExecutionTarget[];
  restorePoint: MigrationRestorePointEntry[];
  tableCounts: Record<string, number>;
}

export interface MigrationExecutionResult {
  runId: string;
  planId: string;
  status: 'committed' | 'rolled-back';
  sourceFingerprint: string;
  committedAt: string;
  rolledBackAt?: string;
  insertedRecords: number;
  reusedRecords: number;
  deletedRecords: number;
  tableCounts: Record<string, number>;
  restorePointEntries: number;
}

export interface MigrationExecutionConflict {
  targetTable: WritableMigrationTable;
  targetId: string;
  reason: 'different-existing-record' | 'changed-after-migration';
}

export class MigrationExecutionConflictError extends Error {
  readonly conflicts: MigrationExecutionConflict[];

  constructor(message: string, conflicts: MigrationExecutionConflict[]) {
    super(message);
    this.name = 'MigrationExecutionConflictError';
    this.conflicts = conflicts;
  }
}

interface CommitOptions {
  now?: string;
  failAfterWrites?: number;
}

interface RollbackOptions {
  now?: string;
}

interface PreparedWrite {
  operation: MigrationPlanOperation;
  targetTable: WritableMigrationTable;
  targetId: string;
  targetRecord: Record<string, unknown>;
  recordJson: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function asTimestamp(value: string | undefined): string {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) throw new Error('Migration execution time is invalid.');
  return parsed.toISOString();
}

function isWritableTable(value: string): value is WritableMigrationTable {
  return (writableMigrationTables as readonly string[]).includes(value);
}

function tableFor(
  db: ClassroomDatabase,
  tableName: WritableMigrationTable,
): Table<Record<string, unknown>, string> {
  return db.table(tableName) as Table<Record<string, unknown>, string>;
}

function prepareWrites(plan: ReversibleMigrationPlan): PreparedWrite[] {
  if (plan.status !== 'draft') throw new Error('Only a draft migration plan can be committed.');

  const writeOperations = plan.operations.filter(
    (operation) => operation.action === 'create' || operation.action === 'quarantine',
  );

  if (writeOperations.length !== plan.summary.plannedWriteOperations) {
    throw new Error('Migration plan write counts do not match the operation manifest.');
  }

  if (plan.rollbackOperations.length !== writeOperations.length) {
    throw new Error('Migration plan rollback coverage is incomplete.');
  }

  const rollbackSources = new Set(
    plan.rollbackOperations.map((operation) => operation.sourceOperationId),
  );
  const prepared: PreparedWrite[] = [];

  for (const operation of writeOperations) {
    if (!rollbackSources.has(operation.id)) {
      throw new Error(`Migration operation ${operation.id} has no inverse rollback action.`);
    }
    if (!isWritableTable(operation.targetTable)) {
      throw new Error(`Migration target ${operation.targetTable} is not writable in Phase 1D.`);
    }
    if (!operation.targetId || !isRecord(operation.targetRecord)) {
      throw new Error(`Migration operation ${operation.id} has no valid target record.`);
    }
    if (operation.targetRecord.id !== operation.targetId) {
      throw new Error(`Migration operation ${operation.id} has a mismatched target identifier.`);
    }

    prepared.push({
      operation,
      targetTable: operation.targetTable,
      targetId: operation.targetId,
      targetRecord: operation.targetRecord,
      recordJson: canonicalJson(operation.targetRecord),
    });
  }

  return prepared;
}

function parseManifest(run: MigrationRun): MigrationExecutionManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(run.summaryJson);
  } catch {
    throw new Error('The migration run contains an unreadable recovery manifest.');
  }

  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 'classroom-v20-migration-execution-v1' ||
    typeof parsed.runId !== 'string' ||
    !Array.isArray(parsed.inserted) ||
    !Array.isArray(parsed.reused) ||
    !Array.isArray(parsed.restorePoint) ||
    !isRecord(parsed.tableCounts)
  ) {
    throw new Error('The migration run contains an unsupported recovery manifest.');
  }

  return parsed as unknown as MigrationExecutionManifest;
}

function resultFromManifest(
  manifest: MigrationExecutionManifest,
  status: 'committed' | 'rolled-back',
  deletedRecords = 0,
): MigrationExecutionResult {
  return {
    runId: manifest.runId,
    planId: manifest.planId,
    status,
    sourceFingerprint: manifest.sourceFingerprint,
    committedAt: manifest.committedAt,
    rolledBackAt: manifest.rolledBackAt,
    insertedRecords: manifest.inserted.length,
    reusedRecords: manifest.reused.length,
    deletedRecords,
    tableCounts: manifest.tableCounts,
    restorePointEntries: manifest.restorePoint.length,
  };
}

async function countExecutionTables(db: ClassroomDatabase): Promise<Record<string, number>> {
  const counts = await Promise.all(
    writableMigrationTables.map(
      async (tableName) => [tableName, await tableFor(db, tableName).count()] as const,
    ),
  );
  return Object.fromEntries(counts);
}

export async function commitMigrationPlan(
  plan: ReversibleMigrationPlan,
  db: ClassroomDatabase = classroomDb,
  options: CommitOptions = {},
): Promise<MigrationExecutionResult> {
  const writes = prepareWrites(plan);
  const committedAt = asTimestamp(options.now);
  const runId = `migration-run-${plan.sourceFingerprint}-${stableHash(committedAt)}`;

  return db.transaction(
    'rw',
    [
      db.schoolYears,
      db.learnerContexts,
      db.contextMemberships,
      db.scheduleBlocks,
      db.calendarEvents,
      db.lessonPlans,
      db.sessionOccurrences,
      db.tasks,
      db.quarantineRecords,
      db.migrationRuns,
    ],
    async () => {
      const priorRuns = await db.migrationRuns.toArray();
      const duplicateRun = priorRuns.find((run) => {
        if (run.status !== 'committed') return false;
        try {
          return parseManifest(run).sourceFingerprint === plan.sourceFingerprint;
        } catch {
          return false;
        }
      });

      if (duplicateRun) {
        throw new Error('This backup has already been committed and has not been rolled back.');
      }

      const restorePoint: MigrationRestorePointEntry[] = [];
      const inserted: MigrationExecutionTarget[] = [];
      const reused: MigrationExecutionTarget[] = [];
      const conflicts: MigrationExecutionConflict[] = [];

      for (const write of writes) {
        const table = tableFor(db, write.targetTable);
        const existing = await table.get(write.targetId);
        const existingJson = existing === undefined ? null : canonicalJson(existing);

        restorePoint.push({
          targetTable: write.targetTable,
          targetId: write.targetId,
          beforeJson: existingJson,
        });

        const target: MigrationExecutionTarget = {
          targetTable: write.targetTable,
          targetId: write.targetId,
          operationId: write.operation.id,
          recordJson: write.recordJson,
        };

        if (existingJson === null) {
          inserted.push(target);
        } else if (existingJson === write.recordJson) {
          reused.push(target);
        } else {
          conflicts.push({
            targetTable: write.targetTable,
            targetId: write.targetId,
            reason: 'different-existing-record',
          });
        }
      }

      if (conflicts.length > 0) {
        throw new MigrationExecutionConflictError(
          'Migration stopped because existing v20 records use the same identifiers.',
          conflicts,
        );
      }

      let completedWrites = 0;
      for (const target of inserted) {
        const source = writes.find(
          (write) => write.targetTable === target.targetTable && write.targetId === target.targetId,
        );
        if (!source) throw new Error('Migration execution lost a prepared target record.');

        await tableFor(db, target.targetTable).add(source.targetRecord);
        completedWrites += 1;
        if (options.failAfterWrites !== undefined && completedWrites >= options.failAfterWrites) {
          throw new Error('Injected migration failure for transaction verification.');
        }
      }

      for (const target of inserted) {
        const stored = await tableFor(db, target.targetTable).get(target.targetId);
        if (stored === undefined || canonicalJson(stored) !== target.recordJson) {
          throw new Error(
            `Migration verification failed for ${target.targetTable}/${target.targetId}.`,
          );
        }
      }

      const tableCounts = await countExecutionTables(db);
      const manifest: MigrationExecutionManifest = {
        schemaVersion: 'classroom-v20-migration-execution-v1',
        runId,
        planId: plan.planId,
        sourceFingerprint: plan.sourceFingerprint,
        sourceFormat: plan.sourceFormat,
        sourceAppVersion: plan.sourceAppVersion,
        restorePointCreatedAt: committedAt,
        committedAt,
        inserted,
        reused,
        restorePoint,
        tableCounts,
      };

      const run = migrationRunSchema.parse({
        id: runId,
        sourceFormat: plan.sourceFormat,
        sourceAppVersion: plan.sourceAppVersion,
        startedAt: committedAt,
        completedAt: committedAt,
        status: 'committed',
        summaryJson: JSON.stringify(manifest),
      });
      await db.migrationRuns.add(run);

      return resultFromManifest(manifest, 'committed');
    },
  );
}

export async function rollbackMigrationRun(
  runId: string,
  db: ClassroomDatabase = classroomDb,
  options: RollbackOptions = {},
): Promise<MigrationExecutionResult> {
  const rolledBackAt = asTimestamp(options.now);

  return db.transaction(
    'rw',
    [
      db.schoolYears,
      db.learnerContexts,
      db.contextMemberships,
      db.scheduleBlocks,
      db.calendarEvents,
      db.lessonPlans,
      db.sessionOccurrences,
      db.tasks,
      db.quarantineRecords,
      db.migrationRuns,
    ],
    async () => {
      const run = await db.migrationRuns.get(runId);
      if (!run) throw new Error('The migration run could not be found.');
      if (run.status === 'rolled-back')
        throw new Error('This migration run is already rolled back.');
      if (run.status !== 'committed')
        throw new Error('Only a committed migration run can be rolled back.');

      const manifest = parseManifest(run);
      const conflicts: MigrationExecutionConflict[] = [];

      for (const target of manifest.inserted) {
        const current = await tableFor(db, target.targetTable).get(target.targetId);
        if (current !== undefined && canonicalJson(current) !== target.recordJson) {
          conflicts.push({
            targetTable: target.targetTable,
            targetId: target.targetId,
            reason: 'changed-after-migration',
          });
        }
      }

      if (conflicts.length > 0) {
        throw new MigrationExecutionConflictError(
          'Rollback stopped because migrated records were changed after commit.',
          conflicts,
        );
      }

      let deletedRecords = 0;
      for (const target of manifest.inserted) {
        const table = tableFor(db, target.targetTable);
        if ((await table.get(target.targetId)) !== undefined) {
          await table.delete(target.targetId);
          deletedRecords += 1;
        }
      }

      for (const target of manifest.inserted) {
        if ((await tableFor(db, target.targetTable).get(target.targetId)) !== undefined) {
          throw new Error(
            `Rollback verification failed for ${target.targetTable}/${target.targetId}.`,
          );
        }
      }

      manifest.rolledBackAt = rolledBackAt;
      manifest.tableCounts = await countExecutionTables(db);
      await db.migrationRuns.put(
        migrationRunSchema.parse({
          ...run,
          status: 'rolled-back',
          summaryJson: JSON.stringify(manifest),
        }),
      );

      return resultFromManifest(manifest, 'rolled-back', deletedRecords);
    },
  );
}

export async function getLatestMigrationExecution(
  db: ClassroomDatabase = classroomDb,
): Promise<MigrationExecutionResult | null> {
  const runs = await db.migrationRuns.orderBy('startedAt').reverse().toArray();
  const run = runs.find((candidate) => ['committed', 'rolled-back'].includes(candidate.status));
  if (!run) return null;

  const manifest = parseManifest(run);
  return resultFromManifest(
    manifest,
    run.status === 'rolled-back' ? 'rolled-back' : 'committed',
    run.status === 'rolled-back' ? manifest.inserted.length : 0,
  );
}
