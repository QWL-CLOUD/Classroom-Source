import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seedReminderTask(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['tasks'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('tasks').put({
          id: 'phase-3d-2-task',
          title: 'Reminder source task',
          status: 'active',
          scheduledDate: '2026-07-20',
          scheduledMinute: 600,
          order: 0,
          createdAt: '2026-07-18T12:00:00.000Z',
          updatedAt: '2026-07-18T12:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  });
}

async function createReminder(
  panel: ReturnType<Page['getByRole']>,
  date: string,
  time: string,
  note: string,
): Promise<void> {
  await panel.getByRole('button', { name: 'Add reminder' }).click();
  await panel.getByLabel('Date').fill(date);
  await panel.getByLabel('Time').fill(time);
  await panel.getByLabel('Note').fill(note);
  await panel.getByRole('button', { name: 'Create reminder' }).click();
}

test('Reminder records are source-linked, independently actionable, and undoable', async ({
  page,
}) => {
  await page.goto('./#/tasks');
  await seedReminderTask(page);
  await page.reload();

  const task = page.getByRole('article', { name: 'Reminder source task task' });
  const panel = task.getByRole('region', { name: 'Reminders for Reminder source task' });
  await expect(panel).toBeVisible();

  await createReminder(panel, '2026-07-20', '08:30', 'First reminder');
  await createReminder(panel, '2026-07-20', '09:00', 'Second reminder');

  const attached = panel.getByRole('list', {
    name: 'Reminders attached to Reminder source task',
  });
  await expect(attached.getByRole('listitem')).toHaveCount(2);
  await expect(attached.getByText('Jul 20 at 8:30 AM')).toBeVisible();
  await expect(attached.getByText('Jul 20 at 9:00 AM')).toBeVisible();

  await page.goto('./#/today?date=2026-07-20');
  const todayReminders = page.getByRole('list', {
    name: 'Reminders for Monday, July 20, 2026',
  });
  await expect(todayReminders.getByRole('listitem')).toHaveCount(2);
  await expect(todayReminders.getByText('Reminder source task')).toHaveCount(2);

  const firstTodayReminder = todayReminders
    .getByRole('listitem')
    .filter({ hasText: 'First reminder' });
  await firstTodayReminder.getByRole('button', { name: 'Dismiss' }).click();
  await expect(todayReminders.getByRole('listitem')).toHaveCount(1);
  await expect(
    page
      .getByRole('list', { name: 'Tasks scheduled for 2026-07-20' })
      .getByText('Reminder source task'),
  ).toBeVisible();

  const secondTodayReminder = todayReminders
    .getByRole('listitem')
    .filter({ hasText: 'Second reminder' });
  await secondTodayReminder.getByRole('button', { name: 'Snooze 10 min' }).click();
  await expect(todayReminders.getByText('9:10 AM')).toBeVisible();

  await page.goto('./#/tasks');
  const refreshedTask = page.getByRole('article', { name: 'Reminder source task task' });
  const refreshedPanel = refreshedTask.getByRole('region', {
    name: 'Reminders for Reminder source task',
  });
  const refreshedList = refreshedPanel.getByRole('list', {
    name: 'Reminders attached to Reminder source task',
  });
  const firstAttached = refreshedList.getByRole('listitem').filter({ hasText: 'First reminder' });
  const secondAttached = refreshedList.getByRole('listitem').filter({ hasText: 'Second reminder' });

  await expect(firstAttached.getByText('Dismissed')).toBeVisible();
  await firstAttached.getByRole('button', { name: 'Restore' }).click();
  await expect(firstAttached.getByText('Active')).toBeVisible();

  await secondAttached.getByRole('button', { name: 'Edit' }).click();
  const editForm = refreshedList.locator('form');
  await editForm.getByLabel('Time').fill('10:00');
  await editForm.getByRole('button', { name: 'Save reminder' }).click();
  await expect(
    refreshedList
      .getByRole('listitem')
      .filter({ hasText: 'Second reminder' })
      .getByText('Jul 20 at 10:00 AM'),
  ).toBeVisible();

  await firstAttached.getByRole('button', { name: 'Delete' }).click();
  await expect(refreshedList.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(refreshedList.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(refreshedList.getByRole('listitem')).toHaveCount(1);

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
