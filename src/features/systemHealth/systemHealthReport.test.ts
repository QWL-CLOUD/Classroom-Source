import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  BACKUP_TABLE_NAMES,
  CLASSROOM_APP_VERSION,
  CLASSROOM_DATABASE_SCHEMA_VERSION,
} from '@/features/backupRecovery/backupFormat';

import {
  createSystemHealthReport,
  inspectBrowserStorage,
  requestBrowserStoragePersistence,
  serializeSystemHealthReport,
  systemHealthReportFileName,
} from './systemHealthReport';

let database: ClassroomDatabase;

beforeEach(async () => {
  database = new ClassroomDatabase(`system-health-report-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

describe('browser storage diagnostics', () => {
  it('reports persistent storage and rounded estimates', async () => {
    await expect(
      inspectBrowserStorage({
        persisted: async () => true,
        estimate: async () => ({ usage: 10.4, quota: 100.7 }),
      }),
    ).resolves.toMatchObject({
      status: 'persistent',
      persisted: true,
      canRequestPersistence: false,
      usageBytes: 10,
      quotaBytes: 101,
    });
  });

  it('distinguishes unsupported and failing storage APIs', async () => {
    await expect(inspectBrowserStorage(null)).resolves.toMatchObject({
      status: 'unsupported',
      persisted: null,
    });
    await expect(
      inspectBrowserStorage({ persisted: async () => Promise.reject(new Error('blocked')) }),
    ).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('refreshes the status after a persistence request', async () => {
    let persistent = false;
    await expect(
      requestBrowserStoragePersistence({
        persisted: async () => persistent,
        persist: async () => {
          persistent = true;
          return true;
        },
      }),
    ).resolves.toMatchObject({ status: 'persistent', persisted: true });
  });
});

describe('privacy-safe System Health report', () => {
  it('counts every portable and recovery table without exporting record content', async () => {
    await database.schoolYears.put({
      id: 'private-year-id',
      label: 'Private school year name',
      startsOn: '2026-08-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active',
    });
    await database.calendarEvents.put({
      id: 'private-event-id',
      title: 'Private event title',
      startDate: '2026-09-01',
      category: 'Calendar',
      schoolYearId: 'private-year-id',
    });
    await database.backupSnapshots.put({
      id: 'snapshot-private-id',
      kind: 'pre-restore',
      sourceFormat: 'classroom-v20-backup-v1',
      databaseSchemaVersion: 16,
      recordCount: 2,
      payloadJson: '{"private":"content"}',
      createdAt: '2026-08-05T20:00:00.000Z',
    });

    const report = await createSystemHealthReport(database, {
      generatedAt: '2026-08-05T20:15:00.000Z',
      storage: {
        status: 'best-effort',
        persisted: false,
        canRequestPersistence: true,
        usageBytes: 1024,
        quotaBytes: 4096,
        detail: 'Best effort.',
      },
    });
    const serialized = serializeSystemHealthReport(report);

    expect(report.appVersion).toBe(CLASSROOM_APP_VERSION);
    expect(report.database).toEqual({
      actualSchemaVersion: 17,
      expectedSchemaVersion: CLASSROOM_DATABASE_SCHEMA_VERSION,
      ready: true,
    });
    expect(Object.keys(report.portableTableCounts)).toEqual([...BACKUP_TABLE_NAMES]);
    expect(report.portableTableCounts.schoolYears).toBe(1);
    expect(report.portableTableCounts.calendarEvents).toBe(1);
    expect(report.internalTableCounts.backupSnapshots).toBe(1);
    expect(report.schoolYears.activeCount).toBe(1);
    expect(report.privacy).toEqual({
      containsRecordContent: false,
      containsNames: false,
      containsIds: false,
      containsFilePaths: false,
      containsRawImportedData: false,
    });
    expect(serialized).not.toContain('Private school year name');
    expect(serialized).not.toContain('Private event title');
    expect(serialized).not.toContain('private-year-id');
    expect(serialized).not.toContain('snapshot-private-id');
    expect(serialized).not.toContain('payloadJson');
    expect(serializeSystemHealthReport(report)).toBe(serialized);
  });

  it('uses a stable privacy-safe filename', () => {
    expect(systemHealthReportFileName('2026-08-05T20:15:30.000Z')).toBe(
      'classroom-v20-system-health-20260805T201530Z.json',
    );
  });
});
