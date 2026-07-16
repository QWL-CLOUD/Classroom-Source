import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const syntheticWeekRecords = {
  schoolYears: [
    {
      id: 'phase-2c-school-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  scheduleBlocks: [
    {
      id: 'phase-2c-parent-block',
      title: 'Synthetic Grade 3 day',
      subject: '',
      category: 'Teaching',
      kind: 'container',
      weekdays: [3],
      startMinute: 480,
      endMinute: 900,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-08-31',
      planningEnabled: false,
      bumpEnabled: false,
      showInWeek: true,
      sortOrder: 0,
    },
    {
      id: 'phase-2c-child-block',
      parentId: 'phase-2c-parent-block',
      title: 'Synthetic Chinese lesson',
      subject: 'Chinese',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [3],
      startMinute: 570,
      endMinute: 660,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-08-31',
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: true,
      sortOrder: 1,
    },
    {
      id: 'phase-2c-duplicate-block',
      title: 'Synthetic duplicated lesson',
      subject: '',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [3],
      startMinute: 780,
      endMinute: 840,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-08-31',
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: true,
      sortOrder: 2,
    },
    {
      id: 'phase-2c-friday-block',
      title: 'Synthetic Friday session',
      subject: '',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [5],
      startMinute: 600,
      endMinute: 660,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-08-31',
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: true,
      sortOrder: 0,
    },
    {
      id: 'phase-2c-hidden-block',
      title: 'Synthetic hidden block',
      subject: '',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [5],
      startMinute: 720,
      endMinute: 780,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-08-31',
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: false,
      sortOrder: 1,
    },
  ],
  calendarEvents: [
    {
      id: 'phase-2c-all-day-event',
      title: 'Synthetic school holiday',
      startDate: '2026-07-15',
      category: 'School calendar',
      source: 'synthetic-e2e',
    },
    {
      id: 'phase-2c-timed-event',
      title: 'Synthetic staff meeting',
      startDate: '2026-07-15',
      startMinute: 600,
      endMinute: 660,
      category: 'Meeting',
      source: 'synthetic-e2e',
    },
    {
      id: 'phase-2c-duplicate-event',
      title: 'Synthetic duplicated lesson',
      startDate: '2026-07-15',
      startMinute: 780,
      endMinute: 840,
      category: 'Teaching',
      source: 'synthetic-e2e',
    },
    {
      id: 'phase-2c-personal-event',
      title: 'Synthetic personal appointment',
      startDate: '2026-07-16',
      startMinute: 900,
      endMinute: 930,
      category: 'Personal',
      source: 'synthetic-e2e',
    },
    {
      id: 'phase-2c-spanning-event',
      title: 'Synthetic summer institute',
      startDate: '2026-07-17',
      endDate: '2026-07-19',
      category: 'Professional learning',
      source: 'synthetic-e2e',
    },
  ],
  quarantineRecords: [
    {
      id: 'phase-2c-quarantine-record',
      migrationRunId: 'phase-2c-migration-run',
      entityType: 'calendarEvent',
      legacyStoreKey: 'synthetic-phase-2c-store',
      reason: 'Synthetic invalid date',
      rawJson: JSON.stringify({ title: 'Quarantined week item' }),
      createdAt: '2026-07-15T12:00:00.000Z',
    },
  ],
};

async function seedSyntheticWeek(page: Page): Promise<void> {
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
          for (const value of values) store.put(value);
        }
      });
    } finally {
      database.close();
    }
  }, syntheticWeekRecords);
}

test('Week composes recurring blocks and dated events without duplicate rendering', async ({
  page,
}) => {
  await page.goto('./#/week?date=2026-07-15');
  await expect(page.getByRole('heading', { level: 1, name: 'Week Jul 13 – Jul 19' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Week of July 13, 2026' })).toBeVisible();

  await seedSyntheticWeek(page);
  await page.reload();

  const wednesdayTeaching = page.getByRole('article', {
    name: 'Wednesday, July 15, 2026, 3 items',
  });
  await expect(wednesdayTeaching).toBeVisible();
  await expect(wednesdayTeaching.getByText('Synthetic Grade 3 day', { exact: true })).toBeVisible();
  await expect(wednesdayTeaching.getByText('Synthetic Chinese lesson')).toBeVisible();
  await expect(wednesdayTeaching.getByText('Part of Synthetic Grade 3 day')).toBeVisible();
  await expect(wednesdayTeaching.getByText('Synthetic duplicated lesson')).toHaveCount(1);
  await expect(page.getByText('Synthetic Friday session')).toBeVisible();
  await expect(page.getByText('Synthetic hidden block')).toHaveCount(0);
  await expect(page.getByText('Quarantined week item')).toHaveCount(0);

  await page.getByLabel('View').selectOption('everything');

  const wednesdayEverything = page.getByRole('article', {
    name: 'Wednesday, July 15, 2026, 5 items',
  });
  await expect(wednesdayEverything.getByText('Synthetic school holiday')).toBeVisible();
  await expect(wednesdayEverything.getByText('Synthetic staff meeting')).toBeVisible();
  await expect(wednesdayEverything.getByText('Synthetic duplicated lesson')).toHaveCount(1);
  await expect(page.getByText('1 exact dated duplicate suppressed in this view.')).toBeVisible();

  await page.getByRole('checkbox', { name: 'Weekends' }).check();
  await expect(
    page.getByRole('article', { name: 'Saturday, July 18, 2026, 1 item' }),
  ).toContainText('Synthetic summer institute');
  await expect(page.getByRole('article', { name: 'Sunday, July 19, 2026, 1 item' })).toContainText(
    'Synthetic summer institute',
  );

  await page.getByLabel('View').selectOption('calendar');
  await expect(page.getByText('Synthetic Grade 3 day', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic personal appointment')).toHaveCount(0);
  await expect(page.getByText('Synthetic school holiday')).toBeVisible();

  await page.getByLabel('View').selectOption('personal');
  await expect(page.getByText('Synthetic personal appointment')).toBeVisible();
  await expect(page.getByText('Synthetic school holiday')).toHaveCount(0);

  await page.getByLabel('View').selectOption('everything');
  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);

  await page.getByRole('button', { name: 'Next week, Jul 20 – Jul 26' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Week Jul 20 – Jul 26' })).toBeVisible();
  await expect(page).toHaveURL(/#\/week\?date=2026-07-20$/);

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Week Jul 13 – Jul 19' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Synthetic Friday session')).toBeVisible();
});
