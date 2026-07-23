import { expect, test, type Page } from '@playwright/test';

async function seedLearner(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['schoolYears', 'learnerContexts', 'learnerNotices', 'learnerServiceOccurrences'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        transaction.objectStore('schoolYears').put({
          id: 'service-year',
          label: 'Synthetic 2026–2027',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          active: true,
        });
        transaction.objectStore('learnerContexts').put({
          id: 'service-learner',
          kind: 'individual',
          name: 'Recurring Service Learner',
          schoolYearId: 'service-year',
          status: 'active',
        });
        transaction.objectStore('learnerNotices').clear();
        transaction.objectStore('learnerServiceOccurrences').clear();
      });
    } finally {
      database.close();
    }
  });
}

test('weekly Learner Service appears on matching dates and tracks occurrences with Undo/Redo', async ({
  page,
}) => {
  await page.goto('./#/learners?context=service-learner&support=active');
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 5,
    );
  });
  await seedLearner(page);
  await page.reload();

  const panel = page.getByRole('region', {
    name: 'Support and notices for Recurring Service Learner',
  });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'New record' }).click();

  const form = panel.locator('form');
  await form.getByLabel('Record type').selectOption('learner-service');
  await form.getByLabel('Repeat weekly').check();
  await form.getByLabel('Tuesday').check();
  await form.getByLabel('Starts').fill('2026-07-01');
  await form.getByLabel('Ends').fill('2026-07-31');
  await form.getByLabel('Start time').fill('10:00');
  await form.getByLabel('End time').fill('10:30');
  await form.getByLabel('Title').fill('Weekly speech support');
  await form.getByRole('button', { name: 'Create record' }).click();

  const serviceCard = panel.getByRole('article', {
    name: 'Weekly speech support learner notice',
  });
  await expect(
    serviceCard.getByText('Every Tuesday · 10:00 AM–10:30 AM · Jul 1–Jul 31'),
  ).toBeVisible();

  await page.goto('./#/today?date=2026-07-20');
  await expect(page.getByText('Weekly speech support', { exact: true })).toHaveCount(0);

  await page.goto('./#/today?date=2026-07-21');
  const today = page.getByRole('region', {
    name: 'Students to notice workspace',
  });
  await expect(today.getByText('Weekly speech support', { exact: true })).toBeVisible();
  await expect(today.getByText('10:00 AM–10:30 AM')).toBeVisible();

  await today.getByRole('button', { name: 'Complete service' }).click();
  await expect(today.getByText('Weekly speech support', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(today.getByText('Weekly speech support', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(today.getByText('Weekly speech support', { exact: true })).toHaveCount(0);

  await page.goto('./#/today?date=2026-07-28');
  const nextTuesday = page.getByRole('region', {
    name: 'Students to notice workspace',
  });
  await expect(nextTuesday.getByText('Weekly speech support', { exact: true })).toBeVisible();
  await nextTuesday.getByRole('button', { name: 'Cancel service' }).click();
  await expect(nextTuesday.getByText('Weekly speech support', { exact: true })).toHaveCount(0);

  await page.goto('./#/learners?context=service-learner&support=active');
  const refreshedPanel = page.getByRole('region', {
    name: 'Support and notices for Recurring Service Learner',
  });
  const refreshedCard = refreshedPanel.getByRole('article', {
    name: 'Weekly speech support learner notice',
  });
  await refreshedCard.getByText('Occurrence history (2)').click();
  await expect(refreshedCard.getByText('Jul 21 · Completed')).toBeVisible();
  await expect(refreshedCard.getByText('Jul 28 · Cancelled')).toBeVisible();

  const historyItem = refreshedCard.getByText('Jul 28 · Cancelled').locator('..');
  await historyItem.getByRole('button', { name: 'Restore occurrence' }).click();

  await page.goto('./#/today?date=2026-07-28');
  await expect(page.getByText('Weekly speech support', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Weekly speech support', { exact: true })).toBeVisible();
});
