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
      const safetyEnvelope = createBackupEnvelope(await readBackupTables(this.db), {
        backupId: this.createId(),
        exportedAt: startedAt,
      });
      const safetySnapshot = backupSnapshotSchema.parse({
        id: this.createId(),
        kind: 'pre-restore',
        sourceFormat: CLASSROOM_BACKUP_FORMAT,
        databaseSchemaVersion: safetyEnvelope.databaseSchemaVersion,
        recordCount: Object.values(safetyEnvelope.tableCounts).reduce(
          (total, value) => total + value,
          0,
        ),
        payloadJson: serializeBackupEnvelope(safetyEnvelope),
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

      const staleSnapshots = await this.db.backupSnapshots
        .orderBy('createdAt')
        .reverse()
        .offset(5)
        .toArray();
      if (staleSnapshots.length > 0) {
        await this.db.backupSnapshots.bulkDelete(staleSnapshots.map((snapshot) => snapshot.id));
      }

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
