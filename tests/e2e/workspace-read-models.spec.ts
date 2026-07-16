import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const syntheticWorkspaceRecords = {
  schoolYears: [
    {
      id: 'e2e-school-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  scheduleBlocks: [
    {
      id: 'e2e-schedule-block',
      title: 'Synthetic teaching block',
      subject: '',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [1],
      startMinute: 480,
      endMinute: 530,
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: true,
      sortOrder: 0,
    },
  ],
  calendarEvents: [
    {
      id: 'e2e-calendar-event',
      title: 'Synthetic calendar event',
      startDate: '2026-07-15',
      category: 'Calendar',
    },
  ],
  learnerContexts: [
    {
      id: 'e2e-class-context',
      kind: 'class',
      name: 'Synthetic class',
      schoolYearId: 'e2e-school-year',
      status: 'active',
    },
    {
      id: 'e2e-group-context',
      kind: 'group',
      name: 'Synthetic group',
      schoolYearId: 'e2e-school-year',
      status: 'active',
    },
  ],
  quarantineRecords: [
    {
      id: 'e2e-quarantine-record',
      migrationRunId: 'e2e-migration-run',
      entityType: 'calendarEvent',
      legacyStoreKey: 'synthetic-e2e-store',
      reason: 'Synthetic invalid record',
      rawJson: '{}',
      createdAt: '2026-07-15T12:00:00.000Z',
    },
  ],
};

async function seedSyntheticWorkspace(page: Page): Promise<void> {
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const storeNames = Object.keys(records);
        const transaction = database.transaction(storeNames, 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        for (const [storeName, values] of Object.entries(records)) {
          const store = transaction.objectStore(storeName);
          for (const value of values) {
            store.put(value);
          }
        }
      });
    } finally {
      database.close();
    }
  }, syntheticWorkspaceRecords);
}

test('repository-backed v20 counts survive reload and browser navigation', async ({ page }) => {
  await page.goto('./#/system-health');

  // The record-count section appears only after the repository has opened Dexie.
  const initialRecordCounts = page.getByRole('region', {
    name: 'Current v20 record counts',
  });
  await expect(page.getByRole('heading', { level: 1, name: 'System Health' })).toBeVisible();
  await expect(initialRecordCounts).toContainText('Active school year:');

  await seedSyntheticWorkspace(page);
  await page.reload();

  const recordCounts = page.getByRole('region', { name: 'Current v20 record counts' });
  await expect(page.getByRole('heading', { level: 1, name: 'System Health' })).toBeVisible();
  await expect(page.getByText('Active school year: Synthetic 2026–2027')).toBeVisible();
  await expect(recordCounts.getByText('School years')).toBeVisible();
  await expect(recordCounts.getByText('Schedule blocks')).toBeVisible();
  await expect(recordCounts.getByText('Calendar events')).toBeVisible();
  await expect(recordCounts.getByText('Learner contexts')).toBeVisible();
  await expect(recordCounts.getByText('Quarantine records')).toBeVisible();
  await expect(recordCounts.getByText('2', { exact: true })).toBeVisible();
  await expect(recordCounts.getByText('1', { exact: true })).toHaveCount(4);

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Good/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'System Health' })).toBeVisible();
  await expect(page.getByText('Active school year: Synthetic 2026–2027')).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
