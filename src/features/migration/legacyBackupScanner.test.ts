import { describe, expect, it } from 'vitest';
import { scanLegacyBackupJson } from './legacyBackupScanner';

function createEnvelope(data: Record<string, string>) {
  return JSON.stringify({
    format: 'classroom-full-local-backup-v18',
    appVersion: '18.0.0',
    storageEncoding: 'raw-localStorage-strings',
    data,
  });
}

describe('legacy backup scanner', () => {
  it('creates a record-level preview without writing data', () => {
    const scan = scanLegacyBackupJson(
      createEnvelope({
        'cos-calendar-events': JSON.stringify([
          { id: 'event-1', date: '2026-07-14' },
          { id: 'event-2', date: '2026-07-15' },
        ]),
        'cos-schedule-blocks': JSON.stringify([{ id: 'block-1' }, { id: 'block-1' }]),
        'cos-lessons': '[]',
        'cos-toolkit': JSON.stringify([{ id: 'activity-1' }]),
        'cos-calendar-quarantine-v19': JSON.stringify([{ id: 'quarantine-1', date: '2026-22-26' }]),
        'cos-unrecognized-private-store': '[]',
      }),
    );

    expect(scan.storeCount).toBe(6);
    expect(scan.recognizedStores).toHaveLength(5);
    expect(scan.unrecognizedStoreCount).toBe(1);
    expect(scan.writeOperations).toBe(0);
    expect(scan.summary).toEqual({
      readyRecords: 3,
      reviewRecords: 0,
      deferredRecords: 1,
      quarantinedRecords: 1,
      skippedRecords: 1,
      invalidStores: 0,
      duplicateIds: 1,
      missingIds: 0,
    });

    const scheduleReport = scan.storeReports.find(
      (report) => report.storeName === 'cos-schedule-blocks',
    );
    expect(scheduleReport).toMatchObject({
      rawRecordCount: 2,
      parsedRecordCount: 2,
      validRecordCount: 1,
      skippedRecordCount: 1,
      duplicateIdCount: 1,
      decision: 'ready',
    });
  });

  it('isolates a malformed store instead of failing the whole scan', () => {
    const scan = scanLegacyBackupJson(
      createEnvelope({
        'cos-calendar-events': JSON.stringify([{ id: 'event-1', date: '2026-07-14' }]),
        'cos-tasks': '{not valid json',
      }),
    );

    expect(scan.summary.readyRecords).toBe(1);
    expect(scan.summary.invalidStores).toBe(1);
    expect(scan.storeReports.find((report) => report.storeName === 'cos-tasks')).toMatchObject({
      decision: 'invalid',
      warnings: ['Stored value is not valid JSON.'],
    });
  });

  it('reports invalid records without exposing their private content', () => {
    const scan = scanLegacyBackupJson(
      createEnvelope({
        'cos-calendar-events': JSON.stringify([
          { id: 'event-1', date: '2026-07-14' },
          { id: 'event-2', date: '2026-22-26' },
          { date: '2026-07-16' },
          'private value',
        ]),
      }),
    );

    const report = scan.storeReports[0];
    expect(report).toMatchObject({
      rawRecordCount: 4,
      parsedRecordCount: 3,
      validRecordCount: 1,
      skippedRecordCount: 3,
      missingIdCount: 1,
    });
    expect(report?.warnings.join(' ')).not.toContain('private value');
  });

  it('rejects files that are not Classroom backup envelopes', () => {
    expect(() => scanLegacyBackupJson('{bad json')).toThrow('not valid JSON');
    expect(() => scanLegacyBackupJson(JSON.stringify({ data: [] }))).toThrow(
      'not a supported Classroom full-backup envelope',
    );
  });
});
