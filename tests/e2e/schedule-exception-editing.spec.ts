import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const syntheticBlocks = [
  {
    id: 'phase-3b-parent',
    title: 'Synthetic school day',
    subject: '',
    category: 'Schedule',
    kind: 'container',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startMinute: 480,
    endMinute: 900,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-07-31',
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 0,
  },
  {
    id: 'phase-3b-child',
    parentId: 'phase-3b-parent',
    title: 'Synthetic language class',
    subject: 'Language',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startMinute: 540,
    endMinute: 600,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-07-31',
    planningEnabled: true,
    bumpEnabled: true,
    showInWeek: true,
    sortOrder: 1,
  },
];

async function seedSchedule(page: Page): Promise<void> {
  await page.evaluate(async (blocks) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['scheduleBlocks', 'scheduleExceptions', 'changeLog'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('scheduleBlocks').clear();
        transaction.objectStore('scheduleExceptions').clear();
        transaction.objectStore('changeLog').clear();
        for (const block of blocks) transaction.objectStore('scheduleBlocks').put(block);
      });
    } finally {
      database.close();
    }
  }, syntheticBlocks);
}

async function openEditor(page: Page, block: string, date: string): Promise<void> {
  await page.goto(`./#/schedule/occurrence/edit?block=${block}&date=${date}&return=week`);
  await seedSchedule(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Edit occurrence' })).toBeVisible();
}

test('This occurrence only synchronizes Calendar, Week, and Today with persistent Undo and Redo', async ({
  page,
}) => {
  await openEditor(page, 'phase-3b-child', '2026-07-17');
  await page.getByLabel('Title').fill('Adjusted Friday language class');
  await page.getByLabel('Start time', { exact: true }).fill('10:00');
  await page.getByLabel('End time', { exact: true }).fill('11:00');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status', { name: 'Occurrence edit status' })).toHaveText(
    'Occurrence saved.',
  );

  await page.goto('./#/week?date=2026-07-17&view=schedule');
  await expect(page.getByText('Adjusted Friday language class', { exact: true })).toHaveCount(1);
  await page.goto('./#/today?date=2026-07-17');
  await expect(
    page.getByRole('heading', {
      name: 'Adjusted Friday language class',
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('./#/calendar?date=2026-07-17');
  await expect(
    page
      .getByRole('article', { name: /Friday, July 17, 2026/ })
      .getByText('Adjusted Friday language class', { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Adjusted Friday language class', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByText('Adjusted Friday language class', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Adjusted Friday language class', { exact: true })).toBeVisible();
});

test('Cancel and Restore default affect only the selected Saturday occurrence', async ({
  page,
}) => {
  await openEditor(page, 'phase-3b-child', '2026-07-18');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Cancel this occurrence' }).click();
  await expect(page.getByRole('status', { name: 'Occurrence edit status' })).toHaveText(
    'Occurrence cancelled.',
  );

  await page.goto('./#/today?date=2026-07-18');
  await expect(page.getByText('Synthetic language class', { exact: true })).toHaveCount(0);
  await page.goto('./#/schedule/occurrence/edit?block=phase-3b-child&date=2026-07-18&return=today');
  await page.getByRole('button', { name: 'Restore default' }).click();
  await expect(page.getByRole('status', { name: 'Occurrence edit status' })).toHaveText(
    'Default schedule restored.',
  );
  await page.goto('./#/today?date=2026-07-18');
  await expect(
    page.getByRole('heading', {
      name: 'Synthetic language class',
      exact: true,
    }),
  ).toBeVisible();
});

test('This and future splits a child while parent subtree splitting stays deferred', async ({
  page,
}) => {
  await openEditor(page, 'phase-3b-parent', '2026-07-18');
  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
  await expect(page.getByRole('radio', { name: /This and future/ })).toBeDisabled();
  await expect(page.getByText(/active child blocks/)).toBeVisible();

  await page.goto('./#/schedule/occurrence/edit?block=phase-3b-child&date=2026-07-18&return=week');
  await page.getByRole('radio', { name: /This and future/ }).check();
  await page.getByLabel('Title').fill('Future language class');
  await page.getByLabel('Start time', { exact: true }).fill('10:00');
  await page.getByLabel('End time', { exact: true }).fill('11:00');
  await page.getByRole('button', { name: 'Save changes' }).click();

  // The success message is set only after splitFuture has completed and
  // navigation has reached the newly created future Schedule Block.
  await expect(page.getByRole('status', { name: 'Occurrence edit status' })).toHaveText(
    'Future schedule saved.',
  );

  await expect(page).not.toHaveURL(/block=phase-3b-child(?:&|%26)/);

  await page.goto('./#/week?date=2026-07-17&view=schedule');
  await expect(page).toHaveURL(/#\/week\?date=2026-07-17&view=schedule/);

  const weekends = page.getByRole('checkbox', { name: 'Weekends' });
  await expect(weekends).toBeVisible();
  await weekends.check();
  await expect(weekends).toBeChecked();

  await expect(page.getByText('Synthetic school day', { exact: true })).toHaveCount(7);
  await expect(page.getByText('Synthetic language class', { exact: true })).toHaveCount(5);
  await expect(page.getByText('Future language class', { exact: true })).toHaveCount(2);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Future language class', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic language class', { exact: true })).toHaveCount(7);

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByText('Future language class', { exact: true })).toHaveCount(2);
});
