import { afterEach, describe, expect, it } from 'vitest';
import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { scanLegacyBackupJson } from './legacyBackupScanner';
import { commitMigrationPlan } from './migrationExecutor';
import { createReversibleMigrationPlan } from './migrationPlan';
import {
  captureLegacyStorageSnapshot,
  generateMigrationAcceptanceReport,
  getLatestMigrationAcceptanceReport,
  getMigrationAcceptanceReport,
  migrationAcceptanceJson,
  migrationAcceptanceMarkdown,
  saveMigrationAcceptanceReport,
} from './migrationAcceptance';

const syntheticBackup = JSON.stringify({
  format: 'classroom-full-local-backup-v18',
  appVersion: '18.0.0',
  storageEncoding: 'raw-localStorage-strings',
  data: {
    'cos-current-school-year': JSON.stringify('2026–2027'),
    'cos-calendar-events': JSON.stringify([
      { id: 'event-1', title: 'Private event name', date: '2026-07-14' },
    ]),
    'cos-schedule-blocks': JSON.stringify([
      {
        id: 'block-1',
        block: 'Private class name',
        days: ['Monday'],
        start: '09:00',
        end: '09:45',
        category: 'Teaching',
      },
    ]),
    'cos-lessons': '[]',
    'cos-toolkit': JSON.stringify([{ id: 'activity-1' }]),
    'cos-planning-templates-v19': JSON.stringify([{ id: 'template-1', flowBlocks: [] }]),
    'cos-calendar-quarantine-v19': JSON.stringify([
      { id: 'quarantine-1', title: 'Private broken event', date: '2026-22-26' },
    ]),
    'cos-private-future-store': JSON.stringify([{ id: 'future-1' }]),
  },
});

const databases: ClassroomDatabase[] = [];

function createDatabase(label: string): ClassroomDatabase {
  const db = new ClassroomDatabase(`classroom-v20-acceptance-${label}-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}

afterEach(async () => {
  for (const db of databases.splice(0)) {
    await db.delete();
  }
});

describe('migration acceptance', () => {
  it('verifies a committed migration and creates a privacy-safe follow-up report', async () => {
    const db = createDatabase('pass');
    const scan = scanLegacyBackupJson(syntheticBackup);
    const plan = createReversibleMigrationPlan(syntheticBackup, {
      now: '2026-07-15T12:00:00.000Z',
    });
    const execution = await commitMigrationPlan(plan, db, {
      now: '2026-07-15T12:05:00.000Z',
    });
    const before = captureLegacyStorageSnapshot({
      length: 1,
      key: () => 'cos-example',
      getItem: () => 'unchanged',
    });

    const report = await generateMigrationAcceptanceReport(scan, plan, execution, db, {
      now: '2026-07-15T12:10:00.000Z',
      legacyStorageBefore: before,
      legacyStorageAfter: before,
    });

    expect(report.status).toBe('passed-with-follow-up');
    expect(report.summary.plannedWrites).toBe(4);
    expect(report.summary.verifiedRecords).toBe(4);
    expect(report.summary.restorePointEntries).toBe(4);
    expect(report.checks.every((check) => check.status !== 'fail')).toBe(true);
    expect(report.followUp.some((item) => item.includes('future v20 schemas'))).toBe(true);
    expect(report.followUp.some((item) => item.includes('outside this migration phase'))).toBe(
      true,
    );

    const serialized = migrationAcceptanceJson(report);
    expect(serialized).not.toContain('Private event name');
    expect(serialized).not.toContain('Private class name');
    expect(serialized).not.toContain('Private broken event');
  });

  it('fails acceptance when a migrated record no longer matches the recovery manifest', async () => {
    const db = createDatabase('changed');
    const scan = scanLegacyBackupJson(syntheticBackup);
    const plan = createReversibleMigrationPlan(syntheticBackup, {
      now: '2026-07-15T13:00:00.000Z',
    });
    const execution = await commitMigrationPlan(plan, db, {
      now: '2026-07-15T13:05:00.000Z',
    });

    const event = await db.calendarEvents.get('event-1');
    if (!event) throw new Error('Synthetic event was not migrated.');
    await db.calendarEvents.put({ ...event, title: 'Edited after commit' });

    const report = await generateMigrationAcceptanceReport(scan, plan, execution, db, {
      now: '2026-07-15T13:10:00.000Z',
      legacyStorageBefore: { keyCount: 0, fingerprint: 'same' },
      legacyStorageAfter: { keyCount: 0, fingerprint: 'same' },
    });

    expect(report.status).toBe('failed');
    expect(report.summary.verifiedRecords).toBe(3);
    expect(report.checks.find((check) => check.id === 'post-commit-verification')?.status).toBe(
      'fail',
    );
  });

  it('detects changes to legacy cos-* browser storage', async () => {
    const db = createDatabase('legacy-change');
    const scan = scanLegacyBackupJson(syntheticBackup);
    const plan = createReversibleMigrationPlan(syntheticBackup, {
      now: '2026-07-15T14:00:00.000Z',
    });
    const execution = await commitMigrationPlan(plan, db, {
      now: '2026-07-15T14:05:00.000Z',
    });

    const report = await generateMigrationAcceptanceReport(scan, plan, execution, db, {
      now: '2026-07-15T14:10:00.000Z',
      legacyStorageBefore: { keyCount: 1, fingerprint: 'before' },
      legacyStorageAfter: { keyCount: 1, fingerprint: 'after' },
    });

    expect(report.status).toBe('failed');
    expect(report.checks.find((check) => check.id === 'legacy-storage')?.status).toBe('fail');
  });

  it('persists and exports the completion report without private source content', async () => {
    const db = createDatabase('persist');
    const scan = scanLegacyBackupJson(syntheticBackup);
    const plan = createReversibleMigrationPlan(syntheticBackup, {
      now: '2026-07-15T15:00:00.000Z',
    });
    const execution = await commitMigrationPlan(plan, db, {
      now: '2026-07-15T15:05:00.000Z',
    });
    const snapshot = { keyCount: 0, fingerprint: 'empty' };
    const report = await generateMigrationAcceptanceReport(scan, plan, execution, db, {
      now: '2026-07-15T15:10:00.000Z',
      legacyStorageBefore: snapshot,
      legacyStorageAfter: snapshot,
    });

    await saveMigrationAcceptanceReport(report, db);

    expect((await getMigrationAcceptanceReport(execution.runId, db))?.reportId).toBe(
      report.reportId,
    );
    expect((await getLatestMigrationAcceptanceReport(db))?.reportId).toBe(report.reportId);

    const markdown = migrationAcceptanceMarkdown(report);
    expect(markdown).toContain('# Classroom v20 Migration Completion Report');
    expect(markdown).toContain('Verified records: 4');
    expect(markdown).not.toContain('Private event name');

    const latest = await db.appSettings.get('migrationAcceptance:latest');
    if (!latest) throw new Error('Latest acceptance setting was not saved.');
    const tampered = JSON.parse(latest.valueJson) as Record<string, unknown>;
    tampered.status = 'passed';
    await db.appSettings.put({ ...latest, valueJson: JSON.stringify(tampered) });
    expect(await getLatestMigrationAcceptanceReport(db)).toBeNull();
  });
});
