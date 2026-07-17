import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const records = {
  schoolYears: [
    {
      id: 'phase-3c-school-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'phase-3c-context',
      kind: 'class',
      name: 'Synthetic planning class',
      schoolYearId: 'phase-3c-school-year',
      status: 'active',
    },
  ],
  scheduleBlocks: [
    {
      id: 'phase-3c-block',
      contextId: 'phase-3c-context',
      title: 'Synthetic language block',
      subject: 'Language',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [5],
      startMinute: 540,
      endMinute: 600,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-07-31',
      planningEnabled: true,
      bumpEnabled: false,
      showInWeek: true,
      sortOrder: 0,
    },
  ],
};

async function seed(page: Page): Promise<void> {
  await page.evaluate(async (values) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(Object.keys(values), 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        for (const [storeName, storeValues] of Object.entries(values)) {
          const store = transaction.objectStore(storeName);
          for (const value of storeValues) store.put(value);
        }
      });
    } finally {
      database.close();
    }
  }, records);
}

test('Planning item becomes one synchronized scheduled and completed session', async ({ page }) => {
  await page.goto('./#/learners?date=2026-07-17');
  await seed(page);
  await page.reload();

  const planning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await planning.getByRole('link', { name: 'New plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Planning' })).toBeVisible();

  await page.getByLabel('Title').fill('Synthetic bridge lesson');
  await page.getByLabel('Subject').fill('Language');
  await page.getByLabel('Planning state').selectOption('ready');
  await page.getByLabel('Preferred schedule block').selectOption('phase-3c-block');
  await page.getByLabel('Duration in minutes').fill('60');
  await page.getByRole('button', { name: 'Save plan' }).click();

  await expect(page).toHaveURL(/planning=unscheduled/);
  const unscheduledPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await unscheduledPlanning.getByRole('tab', { name: /Unscheduled/ }).click();
  const planCard = unscheduledPlanning.getByLabel('Synthetic bridge lesson, Ready');
  await expect(planCard).toBeVisible();
  await planCard.getByRole('link', { name: 'Schedule' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Session' })).toBeVisible();
  await page.getByLabel('Date').fill('2026-07-17');
  await expect(page.getByLabel('Schedule block')).toHaveValue('phase-3c-block');
  await expect(page.getByLabel('Start time')).toHaveValue('09:00');
  await expect(page.getByLabel('End time')).toHaveValue('10:00');
  await expect(page.getByText(/Time inherited from Synthetic language block/)).toBeVisible();
  await page.getByRole('button', { name: 'Schedule session' }).click();

  await expect(page).toHaveURL(/planning=upcoming/);
  const upcomingPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  const sessionCard = upcomingPlanning.getByLabel('Synthetic bridge lesson, Scheduled');
  await expect(sessionCard.getByText('Friday, July 17, 2026')).toBeVisible();
  await expect(sessionCard.getByText('9:00 AM–10:00 AM')).toBeVisible();

  await page.goto('./#/today?date=2026-07-17');
  const todaySession = page
    .locator('[data-today-item^="session-occurrence:"]')
    .filter({ hasText: 'Synthetic bridge lesson' });
  await expect(todaySession).toBeVisible();
  await expect(todaySession.getByText('Session', { exact: true })).toBeVisible();

  await page.goto('./#/week?date=2026-07-17&view=everything');
  const weekSession = page.locator('[data-week-item^="session-occurrence:"]').filter({
    hasText: 'Synthetic bridge lesson',
  });
  await expect(weekSession).toBeVisible();

  await page.goto('./#/calendar?date=2026-07-17');
  const calendarSession = page.locator('[data-calendar-item^="session-occurrence:"]').filter({
    hasText: 'Synthetic bridge lesson',
  });
  await expect(calendarSession).toBeVisible();
  await calendarSession
    .getByRole('link', { name: 'Manage Synthetic bridge lesson session' })
    .click();

  await page.getByRole('button', { name: 'Mark complete' }).click();
  await expect(page).toHaveURL(/planning=completed/);
  const completedPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await expect(completedPlanning.getByLabel('Synthetic bridge lesson, Completed')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await completedPlanning.getByRole('tab', { name: /Upcoming/ }).click();
  await expect(completedPlanning.getByLabel('Synthetic bridge lesson, Scheduled')).toBeVisible();

  await page.getByRole('button', { name: 'Redo' }).click();
  await completedPlanning.getByRole('tab', { name: /Completed/ }).click();
  await expect(completedPlanning.getByLabel('Synthetic bridge lesson, Completed')).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
