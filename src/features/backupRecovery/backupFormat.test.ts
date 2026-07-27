import { describe, expect, it } from 'vitest';

import {
  buildRestorePreview,
  createBackupEnvelope,
  emptyBackupTables,
  serializeBackupEnvelope,
  stableIntegrityHash,
  type ClassroomBackupEnvelope,
} from './backupFormat';

const now = '2026-07-27T12:00:00.000Z';

function task(id: string) {
  return {
    id,
    title: `Task ${id}`,
    status: 'active',
    order: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function resign(envelope: ClassroomBackupEnvelope): string {
  const content: Partial<ClassroomBackupEnvelope> = { ...envelope };
  delete content.integrityHash;
  return serializeBackupEnvelope({
    ...envelope,
    integrityHash: stableIntegrityHash(content),
  });
}

describe('Classroom backup format', () => {
  it('creates and validates a complete versioned backup envelope', () => {
    const tables = emptyBackupTables();
    tables.tasks.push(task('task-1'));
    const envelope = createBackupEnvelope(tables, {
      backupId: 'backup-1',
      exportedAt: now,
    });

    const preview = buildRestorePreview(serializeBackupEnvelope(envelope));

    expect(preview.backupId).toBe('backup-1');
    expect(preview.validRecordCount).toBe(1);
    expect(preview.quarantineCount).toBe(0);
    expect(preview.validTables.tasks).toEqual([task('task-1')]);
    expect(preview.tableSummaries).toHaveLength(27);
  });

  it('restores a schema v10 backup with the new Student and roster tables empty', () => {
    const current = createBackupEnvelope(emptyBackupTables(), {
      backupId: 'legacy-backup',
      exportedAt: now,
    });
    const legacyTables = { ...current.tables } as Record<string, unknown[]>;
    const legacyCounts = { ...current.tableCounts } as Record<string, number>;
    delete legacyTables.studentRecords;
    delete legacyTables.rosterMemberships;
    delete legacyCounts.studentRecords;
    delete legacyCounts.rosterMemberships;
    const legacyEnvelope = {
      ...current,
      databaseSchemaVersion: 10,
      tables: legacyTables,
      tableCounts: legacyCounts,
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(legacyEnvelope));

    expect(preview.validTables.studentRecords).toEqual([]);
    expect(preview.validTables.rosterMemberships).toEqual([]);
    expect(preview.warnings.join(' ')).toMatch(/predates independent Student/);
  });

  it('rejects a backup whose content no longer matches its integrity hash', () => {
    const envelope = createBackupEnvelope(emptyBackupTables(), {
      backupId: 'backup-integrity',
      exportedAt: now,
    });
    const tampered = serializeBackupEnvelope({
      ...envelope,
      appVersion: 'modified-after-export',
    });

    expect(() => buildRestorePreview(tampered)).toThrow(/integrity check failed/i);
  });

  it('isolates unknown, invalid, and duplicate records without writing them to active tables', () => {
    const tables = emptyBackupTables();
    tables.tasks.push(task('task-valid'), task('task-valid'), {
      id: 'task-invalid',
      status: 'active',
    });
    const base = createBackupEnvelope(tables, {
      backupId: 'backup-quarantine',
      exportedAt: now,
    });
    const envelope = {
      ...base,
      tables: {
        ...base.tables,
        futureWidgets: [{ id: 'future-1', content: 'Preserve me' }],
      },
    } as unknown as ClassroomBackupEnvelope;

    const preview = buildRestorePreview(resign(envelope));

    expect(preview.validTables.tasks).toEqual([task('task-valid')]);
    expect(preview.quarantineCount).toBe(3);
    expect(preview.quarantined.map((item) => item.tableName)).toEqual([
      'futureWidgets',
      'tasks',
      'tasks',
    ]);
  });
});
