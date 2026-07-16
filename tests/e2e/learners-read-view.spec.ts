import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const syntheticLearnerRecords = {
  schoolYears: [
    {
      id: 'phase-2e-school-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'phase-2e-class-context',
      kind: 'class',
      name: 'Synthetic Grade 3',
      schoolYearId: 'phase-2e-school-year',
      status: 'active',
      notes: 'Synthetic class context for browser validation.',
    },
    {
      id: 'phase-2e-group-context',
      kind: 'group',
      name: 'Synthetic reading group',
      schoolYearId: 'phase-2e-school-year',
      status: 'active',
    },
    {
      id: 'phase-2e-individual-context',
      kind: 'individual',
      name: 'Synthetic learner',
      preferredName: 'Sample',
      schoolYearId: 'phase-2e-school-year',
      status: 'active',
    },
    {
      id: 'phase-2e-archived-context',
      kind: 'individual',
      name: 'Archived synthetic learner',
      schoolYearId: 'phase-2e-school-year',
      status: 'archived',
    },
  ],
  lessonPlans: [
    {
      id: 'phase-2e-class-upcoming-plan',
      contextId: 'phase-2e-class-context',
      title: 'Synthetic fractions lesson',
      subject: 'Math',
      workflowState: 'ready',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-14T12:00:00.000Z',
    },
    {
      id: 'phase-2e-class-past-plan',
      contextId: 'phase-2e-class-context',
      title: 'Synthetic past scheduled lesson',
      subject: 'Math',
      workflowState: 'ready',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-10T12:00:00.000Z',
    },
    {
      id: 'phase-2e-group-ready-plan',
      contextId: 'phase-2e-group-context',
      title: 'Synthetic phonics plan',
      subject: 'Reading',
      workflowState: 'ready',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-14T12:00:00.000Z',
    },
    {
      id: 'phase-2e-group-cancelled-plan',
      contextId: 'phase-2e-group-context',
      title: 'Synthetic cancelled-only plan',
      subject: 'Reading',
      workflowState: 'draft',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-13T12:00:00.000Z',
    },
    {
      id: 'phase-2e-group-archived-plan',
      contextId: 'phase-2e-group-context',
      title: 'Synthetic archived plan',
      subject: 'Reading',
      workflowState: 'archived',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-15T12:00:00.000Z',
    },
    {
      id: 'phase-2e-individual-completed-plan',
      contextId: 'phase-2e-individual-context',
      title: 'Synthetic completed conference',
      subject: 'Conference',
      workflowState: 'ready',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-14T12:00:00.000Z',
    },
  ],
  sessionOccurrences: [
    {
      id: 'phase-2e-class-upcoming-session',
      lessonPlanId: 'phase-2e-class-upcoming-plan',
      contextId: 'phase-2e-class-context',
      date: '2026-07-20',
      startMinute: 570,
      endMinute: 630,
      deliveryState: 'scheduled',
    },
    {
      id: 'phase-2e-class-past-session',
      lessonPlanId: 'phase-2e-class-past-plan',
      contextId: 'phase-2e-class-context',
      date: '2026-07-10',
      startMinute: 570,
      endMinute: 630,
      deliveryState: 'scheduled',
    },
    {
      id: 'phase-2e-group-cancelled-session',
      lessonPlanId: 'phase-2e-group-cancelled-plan',
      contextId: 'phase-2e-group-context',
      date: '2026-07-18',
      startMinute: 600,
      endMinute: 660,
      deliveryState: 'cancelled',
    },
    {
      id: 'phase-2e-individual-completed-session',
      lessonPlanId: 'phase-2e-individual-completed-plan',
      contextId: 'phase-2e-individual-context',
      date: '2026-07-14',
      startMinute: 780,
      endMinute: 810,
      deliveryState: 'completed',
      completedAt: '2026-07-14T17:30:00.000Z',
    },
  ],
};

async function seedSyntheticLearners(page: Page): Promise<void> {
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const storeNames = Object.keys(records);
        const transaction = database.transaction(storeNames, 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        for (const [storeName, values] of Object.entries(records)) {
          const store = transaction.objectStore(storeName);
          for (const value of values) store.put(value);
        }
      });
    } finally {
      database.close();
    }
  }, syntheticLearnerRecords);
}

test('Learners renders active contexts and shared planning views from v20 data', async ({
  page,
}) => {
  await page.goto('./#/learners?date=2026-07-15');
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No active learner contexts' })).toBeVisible();

  await seedSyntheticLearners(page);
  await page.reload();

  const contexts = page.getByRole('region', { name: 'Learner contexts' });
  await expect(contexts).toBeVisible();
  await expect(contexts.getByRole('heading', { name: 'Classes' })).toBeVisible();
  await expect(contexts.getByRole('heading', { name: 'Groups' })).toBeVisible();
  await expect(contexts.getByRole('heading', { name: 'Individuals' })).toBeVisible();
  await expect(page.getByText('Archived synthetic learner')).toHaveCount(0);

  const classPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic Grade 3',
  });
  await expect(classPlanning).toBeVisible();
  const upcomingList = classPlanning.getByRole('list', {
    name: 'Upcoming planning for Synthetic Grade 3',
  });
  const upcomingItem = upcomingList.getByLabel('Synthetic fractions lesson, Scheduled');
  await expect(
    upcomingItem.getByRole('heading', { name: 'Synthetic fractions lesson' }),
  ).toBeVisible();
  await expect(upcomingItem.getByText('Monday, July 20, 2026')).toBeVisible();
  await expect(upcomingItem.getByText('9:30 AM–10:30 AM')).toBeVisible();
  await expect(upcomingItem.getByRole('link', { name: 'View in Week' })).toHaveAttribute(
    'href',
    '#/week?date=2026-07-20&view=everything&focus=session-occurrence%3Aphase-2e-class-upcoming-session',
  );
  await expect(classPlanning.getByText('Synthetic past scheduled lesson')).toHaveCount(0);

  await contexts.getByRole('button', { name: 'Open Synthetic reading group group' }).click();
  await expect(page).toHaveURL(/context=phase-2e-group-context/);
  const groupPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic reading group',
  });
  await groupPlanning.getByRole('tab', { name: /Unscheduled/ }).click();
  await expect(page).toHaveURL(/planning=unscheduled/);
  const unscheduledList = groupPlanning.getByRole('list', {
    name: 'Unscheduled planning for Synthetic reading group',
  });
  await expect(unscheduledList.getByText('Synthetic phonics plan')).toBeVisible();
  await expect(unscheduledList.getByText('Synthetic cancelled-only plan')).toBeVisible();
  await expect(groupPlanning.getByText('Synthetic archived plan')).toHaveCount(0);

  await contexts.getByRole('button', { name: 'Open Synthetic learner individual' }).click();
  const individualPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic learner',
  });
  await individualPlanning.getByRole('tab', { name: /Completed/ }).click();
  const completedList = individualPlanning.getByRole('list', {
    name: 'Completed planning for Synthetic learner',
  });
  const completedItem = completedList.getByLabel('Synthetic completed conference, Completed');
  await expect(completedItem.getByText('Tuesday, July 14, 2026')).toBeVisible();
  await expect(completedItem.getByRole('link', { name: 'View in Week' })).toHaveAttribute(
    'href',
    '#/week?date=2026-07-14&view=everything&focus=session-occurrence%3Aphase-2e-individual-completed-session',
  );

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);

  await page.reload();
  await expect(page.getByRole('region', { name: 'Planning for Synthetic learner' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Completed/, selected: true })).toBeVisible();
});
