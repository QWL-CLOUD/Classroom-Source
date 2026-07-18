import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const records = {
  schoolYears: [
    {
      id: 'series-lifecycle-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'series-lifecycle-context',
      kind: 'class',
      name: 'Series lifecycle class',
      schoolYearId: 'series-lifecycle-year',
      status: 'active',
    },
  ],
  lessonSeries: [
    {
      id: 'series-lifecycle-series',
      contextId: 'series-lifecycle-context',
      title: 'Original lifecycle unit',
      subject: 'Language',
      lifecycleState: 'active',
    },
  ],
  lessonPlans: [
    {
      id: 'series-lifecycle-plan-scheduled',
      contextId: 'series-lifecycle-context',
      title: 'Scheduled lifecycle lesson',
      subject: 'Language',
      workflowState: 'ready',
      seriesId: 'series-lifecycle-series',
      sequence: 0,
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-01T12:00:00.000Z',
    },
    {
      id: 'series-lifecycle-plan-completed',
      contextId: 'series-lifecycle-context',
      title: 'Completed lifecycle lesson',
      subject: 'Language',
      workflowState: 'ready',
      seriesId: 'series-lifecycle-series',
      sequence: 1,
      createdAt: '2026-07-01T12:00:01.000Z',
      updatedAt: '2026-07-01T12:00:01.000Z',
    },
    {
      id: 'series-lifecycle-plan-unscheduled',
      contextId: 'series-lifecycle-context',
      title: 'Unscheduled lifecycle lesson',
      subject: 'Language',
      workflowState: 'draft',
      seriesId: 'series-lifecycle-series',
      sequence: 2,
      createdAt: '2026-07-01T12:00:02.000Z',
      updatedAt: '2026-07-01T12:00:02.000Z',
    },
  ],
  sessionOccurrences: [
    {
      id: 'series-lifecycle-session-scheduled',
      lessonPlanId: 'series-lifecycle-plan-scheduled',
      contextId: 'series-lifecycle-context',
      date: '2026-07-24',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'scheduled',
    },
    {
      id: 'series-lifecycle-session-completed',
      lessonPlanId: 'series-lifecycle-plan-completed',
      contextId: 'series-lifecycle-context',
      date: '2026-07-17',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'completed',
      completedAt: '2026-07-17T15:00:00.000Z',
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

test('Lesson Series lifecycle preserves plans, sessions, and teaching history', async ({
  page,
}) => {
  await page.goto('./#/learners?date=2026-07-18');
  await seed(page);
  await page.reload();

  const planning = page.getByRole('region', { name: 'Planning for Series lifecycle class' });
  await planning.getByRole('tab', { name: /Series/ }).click();
  let seriesCard = planning.getByLabel('Original lifecycle unit, Active lesson series');
  await expect(seriesCard).toBeVisible();
  await expect(seriesCard.getByText('3 Plans', { exact: true })).toBeVisible();
  await expect(seriesCard.getByText('1 Unscheduled', { exact: true })).toBeVisible();
  await expect(seriesCard.getByText('1 Scheduled', { exact: true })).toBeVisible();
  await expect(seriesCard.getByText('1 Completed', { exact: true })).toBeVisible();

  await seriesCard.getByRole('button', { name: 'Rename' }).click();
  await seriesCard.getByLabel('Series title').fill('Renamed lifecycle unit');
  await seriesCard.getByRole('button', { name: 'Save name' }).click();
  seriesCard = planning.getByLabel('Renamed lifecycle unit, Active lesson series');
  await expect(seriesCard).toBeVisible();

  await seriesCard.getByRole('button', { name: 'Archive' }).click();
  seriesCard = planning.getByLabel('Renamed lifecycle unit, Archived lesson series');
  await expect(seriesCard).toBeVisible();

  await planning.getByRole('link', { name: 'New plan' }).click();
  await expect(
    page.getByLabel('Lesson series').getByRole('option', { name: 'Renamed lifecycle unit' }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to Learners' }).click();
  const returnedPlanning = page.getByRole('region', {
    name: 'Planning for Series lifecycle class',
  });
  await returnedPlanning.getByRole('tab', { name: /Series/ }).click();
  seriesCard = returnedPlanning.getByLabel('Renamed lifecycle unit, Archived lesson series');
  await seriesCard.getByRole('button', { name: 'Restore' }).click();
  seriesCard = returnedPlanning.getByLabel('Renamed lifecycle unit, Active lesson series');
  await expect(seriesCard).toBeVisible();

  await seriesCard.getByRole('button', { name: 'Delete series' }).click();
  await expect(seriesCard.getByText('Delete Series “Renamed lifecycle unit”?')).toBeVisible();
  await expect(
    seriesCard.getByText(/3 linked Plans will become ungrouped.*Teaching history is preserved/),
  ).toBeVisible();
  await seriesCard.getByRole('button', { name: 'Confirm delete series' }).click();
  await expect(returnedPlanning.getByText('No lesson series have been created')).toBeVisible();

  await returnedPlanning.getByRole('tab', { name: /Upcoming/ }).click();
  const scheduledCard = returnedPlanning.getByLabel('Scheduled lifecycle lesson, Scheduled');
  await expect(scheduledCard).toBeVisible();
  await expect(scheduledCard.getByText(/Renamed lifecycle unit/)).toHaveCount(0);

  await returnedPlanning.getByRole('tab', { name: /Completed/ }).click();
  const completedCard = returnedPlanning.getByLabel('Completed lifecycle lesson, Completed');
  await expect(completedCard).toBeVisible();
  await expect(completedCard.getByText(/Renamed lifecycle unit/)).toHaveCount(0);

  await returnedPlanning.getByRole('tab', { name: /Unscheduled/ }).click();
  const unscheduledCard = returnedPlanning.getByLabel('Unscheduled lifecycle lesson, Draft');
  await expect(unscheduledCard).toBeVisible();
  await expect(unscheduledCard.getByText(/Renamed lifecycle unit/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await returnedPlanning.getByRole('tab', { name: /Series/ }).click();
  await expect(
    returnedPlanning.getByLabel('Renamed lifecycle unit, Active lesson series'),
  ).toBeVisible();
  await returnedPlanning.getByRole('tab', { name: /Completed/ }).click();
  await expect(
    returnedPlanning
      .getByLabel('Completed lifecycle lesson, Completed')
      .getByText('Lesson 2 of 3 in “Renamed lifecycle unit”', { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Redo' }).click();
  await returnedPlanning.getByRole('tab', { name: /Series/ }).click();
  await expect(returnedPlanning.getByText('No lesson series have been created')).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
