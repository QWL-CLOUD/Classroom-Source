import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function runTaskMenuAction(task: ReturnType<Page['getByRole']>, name: string): Promise<void> {
  const summary = task.locator('summary', { hasText: 'More task actions' });
  const menu = summary.locator('..');
  await expect(summary).toBeVisible();
  await summary.click();

  const action = menu.getByRole('button', { name, exact: true });
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
  await action.click();
}

async function seedTaskContext(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['schoolYears', 'learnerContexts'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('schoolYears').put({
          id: 'phase-3d-1-year',
          label: 'Synthetic 2026–2027',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          active: true,
        });
        transaction.objectStore('learnerContexts').put({
          id: 'phase-3d-1-class',
          kind: 'class',
          name: 'Task Lifecycle Grade 3',
          schoolYearId: 'phase-3d-1-year',
          status: 'active',
        });
      });
    } finally {
      database.close();
    }
  });
}

test('Tasks and Today share one undoable task through the full lifecycle', async ({ page }) => {
  await page.goto('./#/tasks');
  await seedTaskContext(page);
  await page.reload();

  await page.getByRole('button', { name: 'New task' }).click();
  const newTask = page.getByRole('region', { name: 'New task' });
  await newTask.getByLabel('Task title').fill('Prepare lifecycle materials');
  await newTask.getByLabel('Context').selectOption('phase-3d-1-class');

  const scheduled = newTask.getByRole('group', { name: 'Scheduled' });
  await scheduled.getByLabel('Date').fill('2026-07-20');
  await scheduled.getByLabel('Time').fill('09:15');

  const due = newTask.getByRole('group', { name: 'Due' });
  await due.getByLabel('Date').fill('2026-07-22');
  await due.getByLabel('Time').fill('17:00');
  await newTask.getByLabel('Notes').fill('Use the shared task record in every view.');
  await newTask.getByRole('button', { name: 'Create task' }).click();

  let task = page.getByRole('article', { name: 'Prepare lifecycle materials task' });
  await expect(task).toBeVisible();
  await expect(task.getByText('Scheduled Jul 20 at 9:15 AM')).toBeVisible();
  await expect(task.getByText('Due Jul 22 at 5:00 PM')).toBeVisible();
  await expect(task.getByText('Task Lifecycle Grade 3')).toBeVisible();

  await page.goto('./#/today?date=2026-07-20');
  const todayTasks = page.getByRole('list', { name: 'Tasks scheduled for 2026-07-20' });
  await expect(todayTasks.getByText('Prepare lifecycle materials')).toBeVisible();
  await todayTasks.getByRole('button', { name: 'Complete Prepare lifecycle materials' }).click();
  await expect(page.getByText('No active tasks are scheduled for this date.')).toBeVisible();

  await page.getByRole('link', { name: 'Manage all tasks' }).click();
  task = page.getByRole('article', { name: 'Prepare lifecycle materials task' });
  await expect(page.getByRole('region', { name: 'Completed' }).getByRole('article')).toHaveCount(1);
  await task.getByRole('button', { name: 'Reopen' }).click();
  await expect(page.getByRole('region', { name: 'Active' }).getByRole('article')).toHaveCount(1);

  await runTaskMenuAction(task, 'Move to Waiting');
  await expect(page.getByRole('region', { name: 'Waiting' }).getByRole('article')).toHaveCount(1);
  await runTaskMenuAction(task, 'Restore');
  await expect(page.getByRole('region', { name: 'Active' }).getByRole('article')).toHaveCount(1);

  await runTaskMenuAction(task, 'Cancel task');
  await expect(page.getByRole('region', { name: 'Cancelled' }).getByRole('article')).toHaveCount(1);
  await runTaskMenuAction(task, 'Restore');

  await runTaskMenuAction(task, 'Edit Prepare lifecycle materials');
  await task.getByLabel('Task title').fill('Prepare revised lifecycle materials');
  await task.getByRole('group', { name: 'Scheduled' }).getByLabel('Date').fill('2026-07-21');
  await task.getByRole('button', { name: 'Save task' }).click();

  task = page.getByRole('article', { name: 'Prepare revised lifecycle materials task' });
  await expect(task.getByText('Scheduled Jul 21 at 9:15 AM')).toBeVisible();

  await page.goto('./#/today?date=2026-07-20');
  await expect(page.getByText('No active tasks are scheduled for this date.')).toBeVisible();
  await page.goto('./#/today?date=2026-07-21');
  await expect(page.getByText('Prepare revised lifecycle materials')).toBeVisible();

  await page.goto('./#/tasks');
  task = page.getByRole('article', { name: 'Prepare revised lifecycle materials task' });
  await runTaskMenuAction(task, 'Delete');
  await task.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(task).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  task = page.getByRole('article', { name: 'Prepare revised lifecycle materials task' });
  await expect(task).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(task).toHaveCount(0);

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
