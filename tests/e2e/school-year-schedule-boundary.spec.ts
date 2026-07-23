import { expect, test, type Page } from '@playwright/test';

const records = {
  schoolYears: [
    {
      id: 'boundary-school-year',
      label: 'Boundary school year',
      startsOn: '2026-07-15',
      endsOn: '2026-07-17',
      active: true,
    },
  ],
  scheduleBlocks: [
    {
      id: 'boundary-recurring-block',
      title: 'Boundary recurring block',
      subject: '',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      startMinute: 600,
      endMinute: 660,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-07-31',
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: true,
      sortOrder: 0,
    },
  ],
  calendarEvents: [
    {
      id: 'boundary-dated-event',
      title: 'Boundary dated event',
      startDate: '2026-07-14',
      startMinute: 720,
      endMinute: 780,
      category: 'Calendar',
      source: 'boundary-e2e',
    },
  ],
};

async function seedBoundaryRecords(page: Page): Promise<void> {
  await page.evaluate(async (seed) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const stores = [
          'schoolYears',
          'scheduleBlocks',
          'calendarEvents',
          'scheduleExceptions',
          'changeLog',
        ];
        const transaction = database.transaction(stores, 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        for (const storeName of stores) transaction.objectStore(storeName).clear();
        for (const schoolYear of seed.schoolYears) {
          transaction.objectStore('schoolYears').put(schoolYear);
        }
        for (const block of seed.scheduleBlocks) {
          transaction.objectStore('scheduleBlocks').put(block);
        }
        for (const event of seed.calendarEvents) {
          transaction.objectStore('calendarEvents').put(event);
        }
      });
    } finally {
      database.close();
    }
  }, records);
}

async function clearActiveSchoolYear(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('schoolYears', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('schoolYears').clear();
      });
    } finally {
      database.close();
    }
  });
}

test('School Year bounds defaults while dated items and unconfigured schedules remain visible', async ({
  page,
}) => {
  await page.goto('./#/week?date=2026-07-13&view=schedule');
  await seedBoundaryRecords(page);
  await page.reload();

  const weekends = page.getByRole('checkbox', { name: 'Weekends' });
  if (!(await weekends.isChecked())) await weekends.check();

  await expect(page.getByText('Boundary recurring block', { exact: true })).toHaveCount(3);

  await page.goto('./#/today?date=2026-07-14');
  const beforeBoundary = page.getByRole('region', {
    name: 'Schedule for Tuesday, July 14, 2026',
  });
  await expect(beforeBoundary.getByText('Boundary recurring block', { exact: true })).toHaveCount(
    0,
  );
  await expect(beforeBoundary.getByText('Boundary dated event', { exact: true })).toBeVisible();

  await page.goto('./#/today?date=2026-07-15');
  await expect(
    page.getByRole('heading', { name: 'Boundary recurring block', exact: true }),
  ).toBeVisible();

  await page.goto('./#/calendar?date=2026-07-14');
  const july14 = page.getByRole('article', { name: /Tuesday, July 14, 2026/ });
  await expect(july14.getByText('Boundary dated event', { exact: true })).toBeVisible();
  await expect(july14.getByText(/recurring schedule blocks?/)).toHaveCount(0);

  const july15 = page.getByRole('article', { name: /Wednesday, July 15, 2026/ });
  await july15.getByText(/recurring schedule blocks?/).click();
  await expect(july15.getByText('Boundary recurring block', { exact: true })).toBeVisible();

  await clearActiveSchoolYear(page);
  await page.goto('./#/week?date=2026-07-13&view=schedule');
  await page.reload();
  const restoredWeekends = page.getByRole('checkbox', { name: 'Weekends' });
  if (!(await restoredWeekends.isChecked())) await restoredWeekends.check();

  await expect(page.getByText('Boundary recurring block', { exact: true })).toHaveCount(7);
});
