import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const tableNames = [
  'schoolYears',
  'learnerContexts',
  'learnerNotices',
  'learnerServiceOccurrences',
  'contextMemberships',
  'scheduleBlocks',
  'scheduleExceptions',
  'calendarEvents',
  'categoryValues',
  'categoryAssignments',
  'libraryItems',
  'lessonSeries',
  'lessonPlans',
  'lessonTemplates',
  'standards',
  'standardAlignments',
  'standardImportBatches',
  'sessionOccurrences',
  'tasks',
  'quickCaptures',
  'reminders',
  'migrationRuns',
  'quarantineRecords',
  'changeLog',
  'appSettings',
] as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
  );
}

function jsonString(value: unknown): string {
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error('Fixture value cannot be serialized.');
  return result;
}

function stableIntegrityHash(value: unknown): string {
  const text = jsonString(canonicalize(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function backupWithTasks() {
  const tables = Object.fromEntries(tableNames.map((tableName) => [tableName, []])) as Record<
    string,
    unknown[]
  >;
  tables.tasks = [
    {
      id: 'restored-task',
      title: 'Restored task',
      status: 'active',
      order: 0,
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
    { id: 'invalid-task', status: 'active' },
  ];
  tables.futureWidgets = [{ id: 'future-1', content: 'Preserve future data' }];
  const content = {
    format: 'classroom-v20-backup-v1',
    databaseSchemaVersion: 10,
    appVersion: '20.0.0-alpha.0',
    backupId: 'e2e-restore-backup',
    exportedAt: '2026-07-27T12:00:00.000Z',
    privacy: {
      localOnly: true,
      containsUserContent: true,
      containsFilePaths: false,
      includesRecoveryInternals: false,
    },
    tableCounts: Object.fromEntries(
      tableNames.map((tableName) => [tableName, tables[tableName]!.length]),
    ),
    tables,
  };
  return jsonString({ ...content, integrityHash: stableIntegrityHash(content) });
}

async function waitForSchema(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 13,
    );
  });
}

async function seedCurrentTask(page: Page): Promise<void> {
  await waitForSchema(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('tasks', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('tasks').put({
          id: 'current-task',
          title: 'Current task before restore',
          status: 'active',
          order: 0,
          createdAt: '2026-07-27T11:00:00.000Z',
          updatedAt: '2026-07-27T11:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  });
}

async function seedImportRun(page: Page): Promise<void> {
  await waitForSchema(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('importRuns', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('importRuns').put({
          id: 'current-import-run',
          importType: 'activities',
          sourceKind: 'json',
          sourceLabel: 'activities.json',
          totalRows: 1,
          createdCount: 1,
          updatedCount: 0,
          skippedCount: 0,
          reviewCount: 0,
          blockedCount: 0,
          committedAt: '2026-07-29T12:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  });
}

async function readRecoveryState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const transaction = database.transaction(
        ['tasks', 'backupSnapshots', 'restoreRuns', 'restoreQuarantineRecords'],
        'readonly',
      );
      const all = (store: string) =>
        new Promise<unknown[]>((resolve, reject) => {
          const request = transaction.objectStore(store).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
      return {
        tasks: await all('tasks'),
        snapshots: await all('backupSnapshots'),
        runs: await all('restoreRuns'),
        quarantines: await all('restoreQuarantineRecords'),
      };
    } finally {
      database.close();
    }
  });
}

test('Backup & Recovery downloads a privacy-safe full local backup', async ({ page }) => {
  await page.goto('./#/export');
  await seedCurrentTask(page);
  await seedImportRun(page);
  await page.reload();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full backup' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const envelope = JSON.parse(await readFile(path!, 'utf8')) as Record<string, unknown>;

  expect(envelope.format).toBe('classroom-v20-backup-v1');
  expect(envelope.databaseSchemaVersion).toBe(14);
  expect(envelope).not.toHaveProperty('filePath');
  expect(envelope.tables).toMatchObject({
    tasks: [expect.objectContaining({ id: 'current-task', title: 'Current task before restore' })],
    studentRecords: [],
    rosterMemberships: [],
    assessmentEvidence: [],
    importRuns: [expect.objectContaining({ id: 'current-import-run', importType: 'activities' })],
    classificationMappingPresets: [],
  });
  expect(envelope.tables).not.toHaveProperty('backupSnapshots');

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations,
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});

test('Backup & Recovery previews without writes, saves a safety backup, and restores atomically', async ({
  page,
}) => {
  await page.goto('./#/export');
  await seedCurrentTask(page);
  await page.reload();

  await page.getByLabel('Choose Classroom backup').setInputFiles({
    name: 'reviewed-classroom-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupWithTasks()),
  });

  await expect(page.getByRole('heading', { name: 'Restore preview' })).toBeVisible();
  const previewSummary = page.getByLabel('Restore preview summary');
  await expect(
    previewSummary.getByText('Validated records', { exact: true }).locator('..'),
  ).toContainText('1');
  await expect(
    previewSummary.getByText('Quarantined records', { exact: true }).locator('..'),
  ).toContainText('2');
  await expect
    .poll(() => readRecoveryState(page))
    .toMatchObject({
      tasks: [expect.objectContaining({ id: 'current-task' })],
      snapshots: [],
      runs: [],
      quarantines: [],
    });

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations,
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);

  await page.getByLabel(/I reviewed the table counts/).check();
  await page.getByLabel(/Replace the current Classroom user data/).check();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Restore validated backup' }).click();

  await expect(page.getByText(/Restored 1 records atomically/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restore completed safely' })).toBeVisible();
  await expect
    .poll(() => readRecoveryState(page))
    .toMatchObject({
      tasks: [expect.objectContaining({ id: 'restored-task', title: 'Restored task' })],
      snapshots: [expect.objectContaining({ kind: 'pre-restore', recordCount: 1 })],
      runs: [
        expect.objectContaining({ status: 'committed', sourceBackupId: 'e2e-restore-backup' }),
      ],
      quarantines: expect.arrayContaining([
        expect.objectContaining({ tableName: 'futureWidgets' }),
        expect.objectContaining({ tableName: 'tasks', recordKey: 'invalid-task' }),
      ]),
    });

  await page.reload();
  await expect(page.getByText('1 records')).toBeVisible();
});
