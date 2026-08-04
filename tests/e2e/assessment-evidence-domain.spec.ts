import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function waitForSchema(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 12,
    );
  });
}

async function seedEvidence(page: Page): Promise<void> {
  await waitForSchema(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['schoolYears', 'studentRecords', 'learnerContexts', 'assessmentEvidence'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('schoolYears').put({
          id: 'evidence-year',
          label: '2026–2027',
          startsOn: '2026-08-24',
          endsOn: '2027-06-18',
          active: true,
          lifecycleState: 'active',
        });
        transaction.objectStore('studentRecords').put({
          id: 'evidence-student',
          name: 'Evidence Student',
          status: 'active',
          createdAt: '2026-07-28T12:00:00.000Z',
          updatedAt: '2026-07-28T12:00:00.000Z',
        });
        transaction.objectStore('learnerContexts').put({
          id: 'evidence-class',
          kind: 'class',
          name: 'Evidence Grade 3',
          schoolYearId: 'evidence-year',
          status: 'active',
        });
        transaction.objectStore('assessmentEvidence').put({
          id: 'evidence-record',
          studentId: 'evidence-student',
          schoolYearId: 'evidence-year',
          occurredOn: '2026-09-01',
          title: 'Reading observation',
          kind: 'observation',
          observation: { text: 'Used evidence from the text.' },
          contextId: 'evidence-class',
          standardIds: ['deleted-standard'],
          sourceSnapshots: {
            context: { kind: 'class', name: 'Evidence Grade 3' },
            standards: [
              {
                standardId: 'deleted-standard',
                code: 'RL.3.1',
                statement: 'Ask and answer questions about a text.',
              },
            ],
          },
          status: 'active',
          createdAt: '2026-07-28T12:00:00.000Z',
          updatedAt: '2026-07-28T12:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  });
}

async function archiveStudentAndRemoveContext(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['studentRecords', 'learnerContexts'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('studentRecords').put({
          id: 'evidence-student',
          name: 'Evidence Student',
          status: 'archived',
          archivedAt: '2026-07-28T13:00:00.000Z',
          createdAt: '2026-07-28T12:00:00.000Z',
          updatedAt: '2026-07-28T13:00:00.000Z',
        });
        transaction.objectStore('learnerContexts').delete('evidence-class');
      });
    } finally {
      database.close();
    }
  });
}

async function readEvidence(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const request = database
          .transaction('assessmentEvidence', 'readonly')
          .objectStore('assessmentEvidence')
          .getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    } finally {
      database.close();
    }
  });
}

test('Assessment Evidence persists independently and remains source-traceable in backup', async ({
  page,
}) => {
  await page.goto('./#/export');
  await seedEvidence(page);
  await archiveStudentAndRemoveContext(page);
  await page.reload();

  await expect
    .poll(() => readEvidence(page))
    .toEqual([
      expect.objectContaining({
        id: 'evidence-record',
        studentId: 'evidence-student',
        contextId: 'evidence-class',
        sourceSnapshots: expect.objectContaining({
          context: { kind: 'class', name: 'Evidence Grade 3' },
        }),
      }),
    ]);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full backup' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const envelope = JSON.parse(await readFile(path!, 'utf8')) as {
    databaseSchemaVersion: number;
    tables: { assessmentEvidence: unknown[]; classificationMappingPresets: unknown[] };
  };

  expect(envelope.databaseSchemaVersion).toBe(14);
  expect(envelope.tables.classificationMappingPresets).toEqual([]);
  expect(envelope.tables.assessmentEvidence).toEqual([
    expect.objectContaining({
      id: 'evidence-record',
      studentId: 'evidence-student',
      contextId: 'evidence-class',
    }),
  ]);
});
