import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const syntheticTodayRecords = {
  schoolYears: [
    {
      id: 'phase-2d-school-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  scheduleBlocks: [
    {
      id: 'phase-2d-parent-block',
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
      id: 'phase-2d-child-block',
      parentId: 'phase-2d-parent-block',
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
      id: 'phase-2d-duplicate-block',
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
  ],
  calendarEvents: [
    {
      id: 'phase-2d-all-day-event',
      title: 'Synthetic school holiday',
      startDate: '2026-07-15',
      category: 'School calendar',
      source: 'synthetic-e2e',
    },
    {
      id: 'phase-2d-timed-event',
      title: 'Synthetic staff meeting',
      startDate: '2026-07-15',
      startMinute: 600,
      endMinute: 660,
      category: 'Meeting',
      source: 'synthetic-e2e',
    },
    {
      id: 'phase-2d-duplicate-event',
      title: 'Synthetic duplicated lesson',
      startDate: '2026-07-15',
      startMinute: 780,
      endMinute: 840,
      category: 'Teaching',
      source: 'synthetic-e2e',
    },
    {
      id: 'phase-2d-spanning-event',
      title: 'Synthetic summer institute',
      startDate: '2026-07-15',
      endDate: '2026-07-16',
      startMinute: 780,
      endMinute: 900,
      category: 'Professional learning',
      source: 'synthetic-e2e',
    },
  ],
  learnerContexts: [
    {
      id: 'phase-2d-class-context',
      kind: 'class',
      name: 'Synthetic Grade 3',
      schoolYearId: 'phase-2d-school-year',
      status: 'active',
    },
  ],
  quarantineRecords: [
    {
      id: 'phase-2d-quarantine-record',
      migrationRunId: 'phase-2d-migration-run',
      entityType: 'calendarEvent',
      legacyStoreKey: 'synthetic-phase-2d-store',
      reason: 'Synthetic invalid date',
      rawJson: JSON.stringify({ title: 'Quarantined Today item' }),
      createdAt: '2026-07-15T12:00:00.000Z',
    },
  ],
};

async function seedSyntheticToday(page: Page): Promise<void> {
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
  }, syntheticTodayRecords);
}

test('Today composes the selected date from v20 schedule and calendar records', async ({
  page,
}) => {
  await page.goto('./#/today?date=2026-07-15');

  const schedule = page.getByRole('region', {
    name: 'Schedule for Wednesday, July 15, 2026',
  });
  await expect(schedule).toBeVisible();
  await expect(
    schedule.getByRole('heading', {
      level: 2,
      name: 'Wednesday, July 15, 2026',
    }),
  ).toBeVisible();
  await expect(
    schedule.getByRole('heading', {
      level: 3,
      name: 'No schedule items for this date',
    }),
  ).toBeVisible();

  await seedSyntheticToday(page);
  await page.reload();

  const timeline = page.getByRole('list', {
    name: 'Timeline for Wednesday, July 15, 2026',
  });
  await expect(timeline).toBeVisible();
  await expect(timeline.getByText('Synthetic school holiday')).toBeVisible();
  await expect(timeline.getByText('All day')).toHaveCount(2);
  await expect(timeline.getByText('Synthetic staff meeting')).toBeVisible();
  await expect(
    timeline.locator('li[aria-label^="Synthetic staff meeting, 10:00 AM–11:00 AM"]'),
  ).toBeVisible();
  await expect(timeline.getByText('10:00 AM', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Synthetic Grade 3 day', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Synthetic Chinese lesson')).toBeVisible();
  await expect(timeline.getByText('Part of Synthetic Grade 3 day')).toBeVisible();
  await expect(timeline.getByText('Synthetic duplicated lesson', { exact: true })).toHaveCount(1);
  await expect(timeline.getByText('Synthetic summer institute')).toBeVisible();
  await expect(
    timeline.locator('li[aria-label^="Synthetic summer institute, Starts 1:00 PM"]'),
  ).toBeVisible();

  const reminders = page.getByRole('list', {
    name: 'Calendar reminders for Wednesday, July 15, 2026',
  });
  await expect(reminders.getByText('Synthetic school holiday')).toBeVisible();
  await expect(reminders.getByText('Synthetic staff meeting')).toBeVisible();
  await expect(reminders.getByText('Synthetic duplicated lesson')).toBeVisible();
  await expect(reminders.getByText('Synthetic summer institute')).toBeVisible();

  await expect(
    page.getByText('1 exact dated duplicate suppressed in this timeline.'),
  ).toBeVisible();
  await expect(page.getByText('1 active learner context is connected to v20')).toBeVisible();
  await expect(page.getByText('Quarantined Today item')).toHaveCount(0);
  await expect(
    page.getByText('Quarantined imports remain isolated and are not shown in Today.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'View in Week' })).toHaveAttribute(
    'href',
    '#/week?date=2026-07-15&view=everything',
  );

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);

  await page
    .getByRole('button', {
      name: 'Next day, Thursday, July 16, 2026',
    })
    .click();
  await expect(page).toHaveURL(/#\/today\?date=2026-07-16$/);

  const nextSchedule = page.getByRole('region', {
    name: 'Schedule for Thursday, July 16, 2026',
  });
  await expect(nextSchedule.getByText('Synthetic summer institute')).toBeVisible();
  await expect(nextSchedule.getByText('Until 3:00 PM')).toBeVisible();

  await page.goBack();
  await expect(schedule).toBeVisible();
  await page.reload();
  await expect(timeline.getByText('Synthetic Chinese lesson')).toBeVisible();
});
