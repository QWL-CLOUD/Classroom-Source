import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seedLearnerContext(page: Page): Promise<void> {
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
          id: 'phase-3d-3-year',
          label: 'Synthetic 2026–2027',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          active: true,
        });
        transaction.objectStore('learnerContexts').put({
          id: 'phase-3d-3-learner',
          kind: 'individual',
          name: 'Support Lifecycle Learner',
          schoolYearId: 'phase-3d-3-year',
          status: 'active',
        });
      });
    } finally {
      database.close();
    }
  });
}

test('Today and Learners share one support record with optional Task, Reminder, history, and Undo/Redo', async ({
  page,
}) => {
  await page.goto('./#/today?date=2026-07-20');
  await seedLearnerContext(page);
  await page.reload();

  const todaySupport = page.getByRole('region', { name: 'Students to notice workspace' });
  await todaySupport.getByLabel('Learner context').selectOption('phase-3d-3-learner');
  await todaySupport.getByLabel('Notice').fill('Bring reading folder');
  await todaySupport.getByLabel('Create a separate follow-up Task').check();
  await todaySupport.getByRole('button', { name: 'Add notice' }).click();

  let todayList = todaySupport.getByRole('list', { name: 'Learner notices for 2026-07-20' });
  await expect(todayList.getByText('Bring reading folder')).toBeVisible();
  await expect(todayList.getByText('Support Lifecycle Learner')).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Tasks scheduled for 2026-07-20' })
      .getByText('Follow up: Bring reading folder'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(todaySupport.getByText('No active learner notices for this date.')).toBeVisible();
  await expect(page.getByText('No active tasks are scheduled for this date.')).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).click();
  todayList = todaySupport.getByRole('list', { name: 'Learner notices for 2026-07-20' });
  await expect(todayList.getByText('Bring reading folder')).toBeVisible();
  await expect(page.getByText('Follow up: Bring reading folder')).toBeVisible();

  await todayList.getByRole('link', { name: 'Open learner' }).click();
  const supportPanel = page.getByRole('region', {
    name: 'Support and notices for Support Lifecycle Learner',
  });
  await expect(supportPanel).toBeVisible();
  let notice = supportPanel.getByRole('article', { name: 'Bring reading folder learner notice' });
  await expect(notice.getByText('Date-specific Notice')).toBeVisible();
  await expect(notice.getByText('1 linked follow-up Task')).toBeVisible();

  const reminders = notice.getByRole('region', { name: 'Reminders for Bring reading folder' });
  await reminders.getByRole('button', { name: 'Add reminder' }).click();
  await reminders.getByLabel('Date').fill('2026-07-20');
  await reminders.getByLabel('Time').fill('08:15');
  await reminders.getByLabel('Note').fill('Check at arrival');
  await reminders.getByRole('button', { name: 'Create reminder' }).click();
  await expect(reminders.getByText('Jul 20 at 8:15 AM')).toBeVisible();

  await page.goto('./#/today?date=2026-07-20');
  const todayReminders = page.getByRole('list', {
    name: 'Reminders for Monday, July 20, 2026',
  });
  await expect(todayReminders.getByText('Bring reading folder')).toBeVisible();
  await expect(todayReminders.getByText('Learner notice')).toBeVisible();

  await todayReminders.getByRole('link', { name: 'Bring reading folder' }).click();
  const refreshedPanel = page.getByRole('region', {
    name: 'Support and notices for Support Lifecycle Learner',
  });
  notice = refreshedPanel.getByRole('article', { name: 'Bring reading folder learner notice' });
  await notice.getByRole('button', { name: 'Resolve' }).click();
  await expect(refreshedPanel.getByText('No active support or notice records.')).toBeVisible();

  await refreshedPanel.getByRole('tab', { name: /History 1/ }).click();
  notice = refreshedPanel.getByRole('article', { name: 'Bring reading folder learner notice' });
  await expect(notice.getByText('Resolved')).toBeVisible();
  await notice.getByRole('button', { name: 'Reopen' }).click();
  await refreshedPanel.getByRole('tab', { name: /Active 1/ }).click();

  notice = refreshedPanel.getByRole('article', { name: 'Bring reading folder learner notice' });
  await notice.getByRole('button', { name: 'Edit Bring reading folder' }).click();
  await notice.getByLabel('Record type').selectOption('ongoing-support');
  await notice.getByLabel('Title').fill('Reading folder support');
  await notice.getByLabel('Details').fill('Keep active until the routine is independent.');
  await notice.getByRole('button', { name: 'Save notice' }).click();

  notice = refreshedPanel.getByRole('article', { name: 'Reading folder support learner notice' });
  await expect(notice.getByText('Ongoing Support')).toBeVisible();
  await notice.getByRole('button', { name: 'Check delete safety' }).click();
  await expect(notice.getByText(/Delete is blocked/)).toBeVisible();

  await page.goto('./#/today?date=2026-07-21');
  const nextDayNotices = page.getByRole('list', { name: 'Learner notices for 2026-07-21' });
  await expect(nextDayNotices.getByText('Reading folder support')).toBeVisible();

  await nextDayNotices.getByRole('link', { name: 'Open learner' }).click();
  const finalPanel = page.getByRole('region', {
    name: 'Support and notices for Support Lifecycle Learner',
  });
  notice = finalPanel.getByRole('article', { name: 'Reading folder support learner notice' });
  await notice.getByRole('button', { name: 'Archive' }).click();
  await expect(finalPanel.getByText('No active support or notice records.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    finalPanel.getByRole('article', { name: 'Reading folder support learner notice' }),
  ).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
