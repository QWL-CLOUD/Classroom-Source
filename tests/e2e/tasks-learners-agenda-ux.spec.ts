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
          ['schoolYears', 'learnerContexts', 'tasks', 'reminders'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        const now = '2026-07-20T12:00:00.000Z';
        transaction.objectStore('schoolYears').put({
          id: 'phase-3d-5b-4-year',
          label: 'Synthetic 2026–2027',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          active: true,
        });
        transaction.objectStore('learnerContexts').put({
          id: 'phase-3d-5b-4-class-a',
          kind: 'class',
          name: 'UX Grade 3',
          schoolYearId: 'phase-3d-5b-4-year',
          status: 'active',
        });
        transaction.objectStore('learnerContexts').put({
          id: 'phase-3d-5b-4-class-b',
          kind: 'class',
          name: 'UX Grade 4',
          schoolYearId: 'phase-3d-5b-4-year',
          status: 'active',
        });
        transaction.objectStore('tasks').put({
          id: 'phase-3d-5b-4-task',
          title: 'Prepare UX materials',
          status: 'active',
          scheduledDate: '2026-07-20',
          scheduledMinute: 540,
          order: 0,
          createdAt: now,
          updatedAt: now,
        });
        transaction.objectStore('reminders').put({
          id: 'phase-3d-5b-4-reminder',
          sourceType: 'task',
          sourceId: 'phase-3d-5b-4-task',
          remindDate: '2026-07-20',
          remindMinute: 510,
          status: 'active',
          note: 'Bring the printed cards',
          createdAt: now,
          updatedAt: now,
        });
      });
    } finally {
      database.close();
    }
  });
}

test('Tasks, Learners, and Agenda use compact responsive workspace patterns', async ({ page }) => {
  await page.goto('./#/tasks');
  await seedWorkspaceUx(page);
  await page.reload();

  await expect(page.getByRole('region', { name: 'New task' })).toHaveCount(0);
  await page.getByRole('button', { name: 'New task' }).click();
  await expect(page.getByRole('region', { name: 'New task' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('region', { name: 'New task' })).toHaveCount(0);

  const task = page.getByRole('article', { name: 'Prepare UX materials task' });
  await expect(task.getByRole('button', { name: 'Complete' })).toBeVisible();
  await expect(task.getByRole('button', { name: 'Move to Waiting' })).toBeHidden();
  const taskMenuSummary = task.locator('summary', { hasText: 'More task actions' });
  const taskMenu = taskMenuSummary.locator('..');
  await taskMenuSummary.click();
  await expect(
    taskMenu.getByRole('button', { name: 'Move to Waiting', exact: true }),
  ).toBeVisible();
  await expect(taskMenu.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    './#/learners?context=phase-3d-5b-4-class-a&status=active&planning=upcoming&date=2026-07-20',
  );
  const selectedContext = page.getByRole('region', { name: 'Selected learner context' });
  await expect(selectedContext.getByText('UX Grade 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Learner contexts' })).toBeHidden();
  await selectedContext.getByText('Change learner', { exact: true }).click();
  await page.getByLabel('Class, Group, or Individual').selectOption('phase-3d-5b-4-class-b');
  await expect(page.getByRole('region', { name: 'Planning for UX Grade 4' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  await page.goto('./#/agenda?date=2026-07-20');
  const today = page.getByRole('region', { name: 'Today' });
  const reminder = today.getByRole('listitem').filter({ hasText: 'Bring the printed cards' });
  await expect(reminder.getByText('Reminder for')).toBeVisible();
  await expect(reminder.getByRole('link', { name: 'Prepare UX materials' })).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
