import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const syntheticScheduleBlocks = [
  {
    id: 'phase-3a-parent',
    title: 'Synthetic school day',
    subject: '',
    category: 'Schedule',
    kind: 'container',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startMinute: 480,
    endMinute: 1020,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-07-31',
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 0,
  },
  {
    id: 'phase-3a-dismissal',
    parentId: 'phase-3a-parent',
    title: 'Synthetic dismissal',
    subject: '',
    category: 'Transition',
    kind: 'transition',
    weekdays: [1, 2, 3, 4],
    startMinute: 900,
    endMinute: 930,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-07-31',
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: false,
    sortOrder: 1,
  },
];

async function seedSyntheticSchedule(page: Page): Promise<void> {
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['scheduleBlocks', 'changeLog'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('scheduleBlocks').clear();
        transaction.objectStore('changeLog').clear();
        for (const record of records) transaction.objectStore('scheduleBlocks').put(record);
      });
    } finally {
      database.close();
    }
  }, syntheticScheduleBlocks);
}

test('Schedule Block editing synchronizes Week and supports persistent Undo and Redo', async ({
  page,
}) => {
  await page.goto('./#/schedule/edit?date=2026-07-13');
  await seedSyntheticSchedule(page);
  await page.reload();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Manage recurring schedule' }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Synthetic dismissal/ }).click();

  const showInWeek = page.getByRole('checkbox', { name: /Show in Week/ });
  await expect(showInWeek).not.toBeChecked();
  await showInWeek.check();
  await page.getByRole('button', { name: 'Save block' }).click();
  await expect(page.getByRole('status')).toHaveText('Schedule block saved.');

  await page.getByRole('link', { name: 'Week' }).click();
  await expect(page).toHaveURL(/#\/week\?date=2026-07-13&view=schedule/);
  await expect(page.getByText('Synthetic dismissal', { exact: true })).toHaveCount(4);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Synthetic dismissal', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByText('Synthetic dismissal', { exact: true })).toHaveCount(4);

  await page.reload();
  await expect(page.getByText('Synthetic dismissal', { exact: true })).toHaveCount(4);

  await page.getByRole('link', { name: 'Manage schedule' }).click();
  await page.getByRole('link', { name: /Synthetic dismissal/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('link', { name: /Synthetic dismissal/ })).toHaveCount(0);

  await page.goto('./#/today?date=2026-07-13');
  await expect(page.getByText('Synthetic dismissal', { exact: true })).toHaveCount(0);
  await page.goto('./#/calendar?date=2026-07-13');
  await expect(page.getByText('Synthetic dismissal', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    page
      .getByRole('article', { name: /Monday, July 13, 2026/ })
      .getByText('Synthetic dismissal', { exact: true }),
  ).toBeVisible();
});

test('Schedule Block editor validates recurrence and creates Friday-to-Sunday child blocks', async ({
  page,
}) => {
  await page.goto('./#/schedule/edit?date=2026-07-17');
  await seedSyntheticSchedule(page);
  await page.reload();

  await page.getByRole('link', { name: 'New' }).click();
  await page.getByLabel('Title').fill('');
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    await page.getByRole('checkbox', { name: day, exact: true }).uncheck();
  }
  await page.getByLabel('Start time').fill('11:00');
  await page.getByLabel('End time').fill('10:00');
  await page.getByRole('button', { name: 'Save block' }).click();

  await expect(page.getByText('Enter a schedule block title.')).toBeVisible();
  await expect(page.getByText('Choose at least one weekday.')).toBeVisible();
  await expect(page.getByText('End time must be after the start time.')).toBeVisible();

  await page.getByLabel('Title').fill('Synthetic weekend studio');
  await page.getByLabel('Category').fill('Teaching');
  await page.getByLabel('Start time').fill('10:00');
  await page.getByLabel('End time').fill('11:00');
  await page.getByRole('checkbox', { name: 'Fri', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Sat', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Sun', exact: true }).check();
  await page.getByLabel('Parent block').selectOption('phase-3a-parent');
  await page.getByRole('button', { name: 'Save block' }).click();

  await expect(page).toHaveURL(/#\/schedule\/edit\?id=.+&date=2026-07-17/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Synthetic weekend studio' }),
  ).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);

  await page.goto('./#/week?date=2026-07-17&view=schedule');
  await page.getByRole('checkbox', { name: 'Weekends' }).check();
  await expect(page.getByText('Synthetic weekend studio', { exact: true })).toHaveCount(3);
  await expect(page.getByText('Part of Synthetic school day')).toHaveCount(3);

  await page.goto('./#/calendar?date=2026-07-17');
  for (const dayLabel of [
    'Friday, July 17, 2026',
    'Saturday, July 18, 2026',
    'Sunday, July 19, 2026',
  ]) {
    await expect(
      page
        .getByRole('article', { name: new RegExp(dayLabel) })
        .getByText('Synthetic weekend studio'),
    ).toBeVisible();
  }

  await page.goto('./#/today?date=2026-07-18');
  await expect(page.getByText('Synthetic weekend studio', { exact: true })).toBeVisible();
});
