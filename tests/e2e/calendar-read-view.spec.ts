import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const syntheticCalendarRecords = {
  schoolYears: [
    {
      id: 'phase-2b-school-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  scheduleBlocks: [
    {
      id: 'phase-2b-parent-block',
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
      id: 'phase-2b-child-block',
      parentId: 'phase-2b-parent-block',
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
  ],
  calendarEvents: [
    {
      id: 'phase-2b-all-day-event',
      title: 'Synthetic school holiday',
      startDate: '2026-07-15',
      category: 'School calendar',
      source: 'synthetic-e2e',
    },
    {
      id: 'phase-2b-timed-event',
      title: 'Synthetic staff meeting',
      startDate: '2026-07-15',
      startMinute: 600,
      endMinute: 660,
      category: 'Meeting',
      source: 'synthetic-e2e',
    },
    {
      id: 'phase-2b-spanning-event',
      title: 'Synthetic summer institute',
      startDate: '2026-07-31',
      endDate: '2026-08-02',
      startMinute: 780,
      endMinute: 900,
      category: 'Professional learning',
      source: 'synthetic-e2e',
    },
  ],
  quarantineRecords: [
    {
      id: 'phase-2b-quarantine-record',
      migrationRunId: 'phase-2b-migration-run',
      entityType: 'calendarEvent',
      legacyStoreKey: 'synthetic-phase-2b-store',
      reason: 'Synthetic invalid date',
      rawJson: JSON.stringify({ title: 'Quarantined hidden event' }),
      createdAt: '2026-07-15T12:00:00.000Z',
    },
  ],
};

async function seedSyntheticCalendar(page: Page): Promise<void> {
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
  }, syntheticCalendarRecords);
}

test('Calendar renders migrated events and recurring schedule blocks across navigation', async ({
  page,
}) => {
  await page.goto('./#/calendar?date=2026-07-15');

  await expect(page.getByRole('heading', { level: 1, name: 'Calendar July 2026' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'July 2026 calendar' })).toBeVisible();

  await seedSyntheticCalendar(page);
  await page.reload();

  const july15 = page.getByRole('article', {
    name: 'Wednesday, July 15, 2026, 4 items',
  });
  await expect(july15).toBeVisible();
  await expect(july15.getByText('Synthetic school holiday')).toBeVisible();
  await expect(july15.getByText('All day')).toBeVisible();
  await expect(july15.getByText('Synthetic staff meeting')).toBeVisible();
  await expect(july15.getByText('10:00 AM–11:00 AM')).toBeVisible();
  await expect(july15.getByText('Synthetic Grade 3 day', { exact: true })).toBeVisible();
  await expect(july15.getByText('Synthetic Chinese lesson')).toBeVisible();
  await expect(july15.getByText('Part of Synthetic Grade 3 day')).toBeVisible();

  const july31 = page.getByRole('article', {
    name: 'Friday, July 31, 2026, 1 item',
  });
  const august1 = page.getByRole('article', {
    name: 'Saturday, August 1, 2026, 1 item',
  });
  const august2 = page.getByRole('article', {
    name: 'Sunday, August 2, 2026, 1 item',
  });
  await expect(july31.getByText('Starts 1:00 PM')).toBeVisible();
  await expect(august1.getByText('Continues')).toBeVisible();
  await expect(august2.getByText('Ends 3:00 PM')).toBeVisible();

  await expect(page.getByText('Quarantined hidden event')).toHaveCount(0);
  await expect(
    page.getByText('Quarantined imports remain isolated and are not shown in this calendar.'),
  ).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);

  await page.getByRole('button', { name: 'Next month, August 2026' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar August 2026' })).toBeVisible();
  await expect(page).toHaveURL(/#\/calendar\?date=2026-08-01$/);
  await expect(page.getByRole('region', { name: 'August 2026 calendar' })).toBeVisible();
  await expect(page.getByText('Synthetic summer institute')).toHaveCount(3);

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar July 2026' })).toBeVisible();
  await page.reload();
  await expect(july15.getByText('Synthetic Chinese lesson')).toBeVisible();
});
