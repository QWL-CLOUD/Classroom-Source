import type { Table } from 'dexie';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  backupSnapshotSchema,
  restoreQuarantineRecordSchema,
  restoreRunSchema,
  type BackupSnapshot,
  type RestoreRun,
} from '@/domain/models/entities';

import {
  BACKUP_TABLE_NAMES,
  CLASSROOM_BACKUP_FORMAT,
  createBackupEnvelope,
  emptyBackupTables,
  serializeBackupEnvelope,
  type BackupTableData,
  type BackupTableName,
  type ClassroomBackupEnvelope,
  type RestorePreview,
} from './backupFormat';

export interface BackupRecoveryDependencies {
  createId?: () => string;
  now?: () => string;
}

export interface SafetySnapshotOptions {
  kind: BackupSnapshot['kind'];
  createId: () => string;
  createdAt: string;
}

export interface RestoreCommitResult {
  run: RestoreRun;
  safetySnapshot: BackupSnapshot;
  restoredRecordCount: number;
  quarantineCount: number;
}

function tableFor(db: ClassroomDatabase, tableName: BackupTableName): Table<unknown, string> {
  return db.table(tableName) as Table<unknown, string>;
}

async function readBackupTables(db: ClassroomDatabase): Promise<BackupTableData> {
  const tables = emptyBackupTables();
  for (const tableName of BACKUP_TABLE_NAMES) {
    tables[tableName] = await tableFor(db, tableName).toArray();
  }
  return tables;
}

export async function createSafetySnapshotRecord(
  db: ClassroomDatabase,
  options: SafetySnapshotOptions,
): Promise<BackupSnapshot> {
  const envelope = createBackupEnvelope(await readBackupTables(db), {
    backupId: options.createId(),
    exportedAt: options.createdAt,
  });
  return backupSnapshotSchema.parse({
    id: options.createId(),
    kind: options.kind,
    sourceFormat: CLASSROOM_BACKUP_FORMAT,
    databaseSchemaVersion: envelope.databaseSchemaVersion,
    recordCount: Object.values(envelope.tableCounts).reduce((total, value) => total + value, 0),
    payloadJson: serializeBackupEnvelope(envelope),
    createdAt: options.createdAt,
  });
}

export async function pruneSafetySnapshots(db: ClassroomDatabase, limit = 5): Promise<void> {
  const staleSnapshots = await db.backupSnapshots
    .orderBy('createdAt')
    .reverse()
    .offset(limit)
    .toArray();
  if (staleSnapshots.length > 0) {
    await db.backupSnapshots.bulkDelete(staleSnapshots.map((snapshot) => snapshot.id));
  }
}

export class BackupRecoveryService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: BackupRecoveryDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async createBackup(): Promise<ClassroomBackupEnvelope> {
    const tables = await this.db.transaction(
      'r',
      BACKUP_TABLE_NAMES.map((tableName) => tableFor(this.db, tableName)),
      () => readBackupTables(this.db),
    );
    return createBackupEnvelope(tables, {
      backupId: this.createId(),
      exportedAt: this.now(),
    });
  }

  async listSafetySnapshots(limit = 5): Promise<BackupSnapshot[]> {
    return this.db.backupSnapshots.orderBy('createdAt').reverse().limit(limit).toArray();
  }

  async getSafetySnapshot(id: string): Promise<BackupSnapshot | undefined> {
    return this.db.backupSnapshots.get(id);
  }

  async restore(preview: RestorePreview): Promise<RestoreCommitResult> {
    const startedAt = this.now();
    const transactionTables = [
      ...BACKUP_TABLE_NAMES.map((tableName) => tableFor(this.db, tableName)),
      this.db.backupSnapshots,
      this.db.restoreRuns,
      this.db.restoreQuarantineRecords,
    ];

    return this.db.transaction('rw', transactionTables, async () => {
      const safetySnapshot = await createSafetySnapshotRecord(this.db, {
        kind: 'pre-restore',
        createId: this.createId,
        createdAt: startedAt,
      });
      await this.db.backupSnapshots.put(safetySnapshot);

      for (const tableName of BACKUP_TABLE_NAMES) {
        const table = tableFor(this.db, tableName);
        await table.clear();
        const records = preview.validTables[tableName];
        if (records.length > 0) await table.bulkPut(records);
      }

      const runId = this.createId();
      const completedAt = this.now();
      const run = restoreRunSchema.parse({
        id: runId,
        sourceFormat: preview.format,
        sourceAppVersion: preview.appVersion,
        sourceBackupId: preview.backupId,
        startedAt,
        completedAt,
        status: 'committed',
        safetySnapshotId: safetySnapshot.id,
        summaryJson: JSON.stringify({
          restoredRecordCount: preview.validRecordCount,
          quarantineCount: preview.quarantineCount,
          sourceExportedAt: preview.exportedAt,
          tableSummaries: preview.tableSummaries,
        }),
      });
      await this.db.restoreRuns.put(run);

      if (preview.quarantined.length > 0) {
        await this.db.restoreQuarantineRecords.bulkPut(
          preview.quarantined.map((item) =>
            restoreQuarantineRecordSchema.parse({
              id: this.createId(),
              restoreRunId: runId,
              tableName: item.tableName,
              recordKey: item.recordKey,
              reason: item.reason,
              rawJson: item.rawJson,
              createdAt: completedAt,
            }),
          ),
        );
      }

      await pruneSafetySnapshots(this.db);

      return {
        run,
        safetySnapshot,
        restoredRecordCount: preview.validRecordCount,
        quarantineCount: preview.quarantineCount,
      };
    });
  }
}

export const backupRecoveryService = new BackupRecoveryService();
