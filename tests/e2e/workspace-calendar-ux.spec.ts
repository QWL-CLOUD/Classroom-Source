import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seedWorkspaceUx(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['schoolYears', 'learnerContexts', 'scheduleBlocks', 'calendarEvents'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        transaction.objectStore('schoolYears').put({
          id: 'phase-3d-5b-2-year',
          label: 'Synthetic 2026–2027',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          active: true,
        });
        transaction.objectStore('learnerContexts').put({
          id: 'phase-3d-5b-2-class',
          kind: 'class',
          name: 'Synthetic UX class',
          schoolYearId: 'phase-3d-5b-2-year',
          status: 'active',
        });
        transaction.objectStore('scheduleBlocks').put({
          id: 'phase-3d-5b-2-block',
          contextId: 'phase-3d-5b-2-class',
          title: 'Synthetic UX lesson block',
          subject: 'Chinese',
          category: 'Teaching',
          kind: 'teachable',
          weekdays: [1, 2, 3, 4, 5],
          startMinute: 540,
          endMinute: 600,
          effectiveFrom: '2026-07-01',
          effectiveTo: '2027-06-30',
          planningEnabled: true,
          bumpEnabled: true,
          showInWeek: true,
          sortOrder: 1,
        });
        transaction.objectStore('calendarEvents').put({
          id: 'phase-3d-5b-2-event',
          title: 'Synthetic UX staff event',
          startDate: '2026-07-20',
          startMinute: 630,
          endMinute: 690,
          category: 'Meeting',
        });
      });
    } finally {
      database.close();
    }
  });
}

test('Today prioritizes the schedule and uses one date-aware Add menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/today?date=2026-07-20');
  await seedWorkspaceUx(page);
  await page.reload();

  const schedule = page.getByRole('region', { name: 'Schedule for Monday, July 20, 2026' });
  const toDo = page.getByRole('heading', { name: 'To-do' });
  const [scheduleBox, toDoBox] = await Promise.all([schedule.boundingBox(), toDo.boundingBox()]);
  if (!scheduleBox || !toDoBox) throw new Error('Today mobile geometry could not be measured.');
  expect(scheduleBox.y).toBeLessThan(toDoBox.y);

  await expect(page.getByText('Quick capture')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New plan', exact: true })).toHaveCount(0);

  await page.locator('summary[aria-label="Add to 2026-07-20"]').click();
  const addItems = page.getByRole('navigation', { name: 'Add items for 2026-07-20' });
  await expect(addItems.getByRole('link', { name: /New plan/ })).toBeVisible();
  await expect(addItems.getByRole('link', { name: /New event/ })).toBeVisible();
  await expect(addItems.getByRole('link', { name: /New task/ })).toBeVisible();
  await expect(addItems.getByRole('link', { name: /Learner notice/ })).toBeVisible();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});

test('Week names the day action and mobile Calendar stays compact until expanded', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/week?date=2026-07-20&view=everything');
  await seedWorkspaceUx(page);
  await page.reload();

  const monday = page.locator('[data-date="2026-07-20"]');
  await expect(monday.getByRole('link', { name: /Add lesson plan to Monday/ })).toContainText(
    'Add plan',
  );

  await page.goto('./#/calendar?date=2026-07-20');
  const calendar = page.getByRole('region', { name: 'July 2026 calendar' });
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole('article')).toHaveCount(31);
  const mondayHighlights = calendar.getByRole('list', {
    name: 'Highlights for Monday, July 20, 2026',
  });
  await expect(mondayHighlights.getByText('Synthetic UX staff event')).toBeVisible();
  await expect(mondayHighlights.getByText('Synthetic UX lesson block')).toBeVisible();

  const mondayCard = calendar.getByRole('article', {
    name: /Monday, July 20, 2026/,
  });
  const fullDetails = mondayCard.getByText(/View all .* and manage/);
  await expect(fullDetails).toBeVisible();
  await expect(
    page.locator('[data-calendar-item="schedule-block:phase-3d-5b-2-block:2026-07-20"]'),
  ).toBeHidden();
  await fullDetails.click();
  await expect(
    page.locator('[data-calendar-item="schedule-block:phase-3d-5b-2-block:2026-07-20"]'),
  ).toBeVisible();

  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(pageHeight).toBeLessThan(6500);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
