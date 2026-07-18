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
      effectiveTo: '2026-08-31',
      planningEnabled: true,
      bumpEnabled: true,
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

async function seedBumpScenario(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const values = {
      lessonSeries: [
        {
          id: 'phase-3c-bump-series',
          contextId: 'phase-3c-context',
          title: 'Synthetic bump unit',
          subject: 'Language',
        },
      ],
      lessonPlans: [
        {
          id: 'phase-3c-bump-plan-1',
          contextId: 'phase-3c-context',
          title: 'Bump lesson one',
          subject: 'Language',
          workflowState: 'ready',
          seriesId: 'phase-3c-bump-series',
          sequence: 0,
          preferredScheduleBlockId: 'phase-3c-block',
          createdAt: '2026-07-01T12:00:00.000Z',
          updatedAt: '2026-07-01T12:00:00.000Z',
        },
        {
          id: 'phase-3c-bump-plan-2',
          contextId: 'phase-3c-context',
          title: 'Bump lesson two',
          subject: 'Language',
          workflowState: 'ready',
          seriesId: 'phase-3c-bump-series',
          sequence: 1,
          preferredScheduleBlockId: 'phase-3c-block',
          createdAt: '2026-07-01T12:00:01.000Z',
          updatedAt: '2026-07-01T12:00:01.000Z',
        },
      ],
      sessionOccurrences: [
        {
          id: 'phase-3c-bump-session-1',
          lessonPlanId: 'phase-3c-bump-plan-1',
          contextId: 'phase-3c-context',
          scheduleBlockId: 'phase-3c-block',
          date: '2026-07-17',
          startMinute: 540,
          endMinute: 600,
          deliveryState: 'scheduled',
        },
        {
          id: 'phase-3c-bump-session-2',
          lessonPlanId: 'phase-3c-bump-plan-2',
          contextId: 'phase-3c-context',
          scheduleBlockId: 'phase-3c-block',
          date: '2026-07-31',
          startMinute: 540,
          endMinute: 600,
          deliveryState: 'scheduled',
        },
      ],
      scheduleExceptions: [
        {
          id: 'phase-3c-bump-cancel-friday',
          date: '2026-07-24',
          scheduleBlockId: 'phase-3c-block',
          action: 'cancel',
        },
        {
          id: 'phase-3c-bump-add-saturday',
          date: '2026-07-25',
          scheduleBlockId: 'phase-3c-block',
          action: 'add',
          replacementStartMinute: 600,
          replacementEndMinute: 660,
        },
      ],
    };

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
  });
}

async function seedScheduledReorderScenario(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const values = {
      lessonSeries: [
        {
          id: 'phase-3c-reorder-series',
          contextId: 'phase-3c-context',
          title: 'Synthetic reorder unit',
          subject: 'Language',
        },
      ],
      lessonPlans: [
        {
          id: 'phase-3c-reorder-plan-a',
          contextId: 'phase-3c-context',
          title: 'Reorder lesson A',
          subject: 'Language',
          workflowState: 'ready',
          seriesId: 'phase-3c-reorder-series',
          sequence: 0,
          preferredScheduleBlockId: 'phase-3c-block',
          createdAt: '2026-07-01T12:00:00.000Z',
          updatedAt: '2026-07-01T12:00:00.000Z',
        },
        {
          id: 'phase-3c-reorder-plan-b',
          contextId: 'phase-3c-context',
          title: 'Reorder lesson B',
          subject: 'Language',
          workflowState: 'ready',
          seriesId: 'phase-3c-reorder-series',
          sequence: 1,
          preferredScheduleBlockId: 'phase-3c-block',
          createdAt: '2026-07-01T12:00:01.000Z',
          updatedAt: '2026-07-01T12:00:01.000Z',
        },
      ],
      sessionOccurrences: [
        {
          id: 'phase-3c-reorder-session-a',
          lessonPlanId: 'phase-3c-reorder-plan-a',
          contextId: 'phase-3c-context',
          scheduleBlockId: 'phase-3c-block',
          date: '2026-07-17',
          startMinute: 540,
          endMinute: 600,
          deliveryState: 'scheduled',
        },
        {
          id: 'phase-3c-reorder-session-b',
          lessonPlanId: 'phase-3c-reorder-plan-b',
          contextId: 'phase-3c-context',
          scheduleBlockId: 'phase-3c-block',
          date: '2026-07-24',
          startMinute: 540,
          endMinute: 600,
          deliveryState: 'scheduled',
        },
      ],
    };

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
  });
}

test('Planning item becomes one synchronized scheduled and completed session', async ({ page }) => {
  await page.goto('./#/learners?date=2026-07-10');
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
  await page.getByRole('textbox', { name: 'Date', exact: true }).fill('2026-07-10');
  await expect(page.getByLabel('Schedule block')).toHaveValue('phase-3c-block');
  await expect(page.getByLabel('Start time')).toHaveValue('09:00');
  await expect(page.getByLabel('End time')).toHaveValue('10:00');
  await expect(page.getByText(/Time inherited from Synthetic language block/)).toBeVisible();
  await page.getByRole('button', { name: 'Schedule session' }).click();

  await expect(page).toHaveURL(/planning=upcoming/);
  await expect(page).toHaveURL(/date=2026-07-10/);
  const upcomingPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  const sessionCard = upcomingPlanning.getByLabel('Synthetic bridge lesson, Scheduled');
  await expect(sessionCard.getByText('Friday, July 10, 2026')).toBeVisible();
  await expect(sessionCard.getByText('9:00 AM–10:00 AM')).toBeVisible();
  await sessionCard.getByRole('link', { name: 'View in Calendar' }).click();
  await expect(page).toHaveURL(/#\/calendar\?date=2026-07-10/);
  await expect(
    page.locator('[data-calendar-item^="session-occurrence:"]').filter({
      hasText: 'Synthetic bridge lesson',
    }),
  ).toBeVisible();

  await page.goto('./#/today?date=2026-07-10');
  const todaySession = page
    .locator('[data-today-item^="session-occurrence:"]')
    .filter({ hasText: 'Synthetic bridge lesson' });
  await expect(todaySession).toBeVisible();
  await expect(todaySession.getByText('Session', { exact: true })).toBeVisible();

  await page.goto('./#/week?date=2026-07-10&view=everything');
  const weekSession = page.locator('[data-week-item^="session-occurrence:"]').filter({
    hasText: 'Synthetic bridge lesson',
  });
  await expect(weekSession).toBeVisible();

  await page.goto('./#/calendar?date=2026-07-10');
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

test('Lesson flow inherits into a session, supports an override, and can return to plan content', async ({
  page,
}) => {
  await page.goto('./#/learners?date=2026-07-17');
  await seed(page);
  await page.reload();

  const planning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await planning.getByRole('link', { name: 'New plan' }).click();

  await page.getByLabel('Title').fill('Synthetic lesson flow');
  await page.getByLabel('Planning state').selectOption('ready');
  await page.getByLabel('Preferred schedule block').selectOption('phase-3c-block');

  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step title').fill('Welcome and notice');
  await page.getByLabel('Phase').selectOption('opening');
  await page.getByLabel('Minutes', { exact: true }).fill('5');
  await page.getByLabel('Student activity and directions').fill('Notice the example together.');

  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step title').nth(1).fill('Guided partner practice');
  await page.getByLabel('Phase').nth(1).selectOption('guided-practice');
  await page.getByLabel('Minutes', { exact: true }).nth(1).fill('15');
  await page.getByLabel('Student activity and directions').nth(1).fill('Practice with a partner.');

  await page.getByRole('button', { name: 'Save and schedule' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Session' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Date', exact: true }).fill('2026-07-17');
  await expect(page.getByText('Plan content · live inheritance')).toBeVisible();
  await expect(page.getByText('Welcome and notice', { exact: true })).toBeVisible();
  await expect(page.getByText('Guided partner practice', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Schedule session' }).click();

  const upcoming = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  const inheritedCard = upcoming.getByLabel('Synthetic lesson flow, Scheduled');
  await expect(inheritedCard.getByText('2 steps · 20 min')).toBeVisible();
  await inheritedCard.getByRole('link', { name: 'Manage session' }).click();

  await page.getByRole('button', { name: 'Customize this session' }).click();
  await expect(page.getByText('Session override')).toBeVisible();
  await page.getByLabel('Step title').first().fill('Session-specific welcome');
  await page.getByRole('button', { name: 'Save session' }).click();

  const customizedCard = page
    .getByRole('region', { name: 'Planning for Synthetic planning class' })
    .getByLabel('Synthetic lesson flow, Scheduled');
  await expect(customizedCard.getByText('Customized session')).toBeVisible();
  await customizedCard.getByRole('link', { name: 'Edit plan' }).click();

  await page.getByLabel('Step title').first().fill('Revised plan opening');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await expect(page).toHaveURL(/planning=upcoming&date=2026-07-17/);
  const afterPlanEdit = page
    .getByRole('region', { name: 'Planning for Synthetic planning class' })
    .getByLabel('Synthetic lesson flow, Scheduled');
  await afterPlanEdit.getByRole('link', { name: 'Manage session' }).click();

  await expect(page.getByText('Session-specific welcome', { exact: true })).toBeVisible();
  await expect(page.getByText('Revised plan opening', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use plan content' }).click();
  await expect(page.getByText('Revised plan opening', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save session' }).click();

  const resetCard = page
    .getByRole('region', { name: 'Planning for Synthetic planning class' })
    .getByLabel('Synthetic lesson flow, Scheduled');
  await expect(resetCard.getByText('Customized session')).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(resetCard.getByText('Customized session')).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(resetCard.getByText('Customized session')).toHaveCount(0);

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});

test('Lesson series preserves one ordered plan sequence with undoable reordering', async ({
  page,
}) => {
  await page.goto('./#/learners?date=2026-07-17');
  await seed(page);
  await page.reload();

  const planning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await planning.getByRole('link', { name: 'New plan' }).click();
  await page.getByLabel('Title').fill('Series lesson one');
  await page.getByLabel('Lesson series').selectOption('__new__');
  await page.getByLabel('New series title').fill('Synthetic lesson series');
  await page.getByRole('button', { name: 'Save plan' }).click();

  const unscheduled = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await unscheduled.getByRole('tab', { name: /Unscheduled/ }).click();
  await unscheduled.getByRole('link', { name: 'New plan' }).click();
  await page.getByLabel('Title').fill('Series lesson two');
  await page.getByLabel('Lesson series').selectOption({ label: 'Synthetic lesson series' });
  await page.getByRole('button', { name: 'Save plan' }).click();

  const seriesPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  const firstCard = seriesPlanning.getByLabel('Series lesson one, Draft');
  const secondCard = seriesPlanning.getByLabel('Series lesson two, Draft');
  await expect(
    firstCard.getByText('Lesson 1 of 2 in “Synthetic lesson series”', { exact: true }),
  ).toBeVisible();
  await expect(
    secondCard.getByText('Lesson 2 of 2 in “Synthetic lesson series”', { exact: true }),
  ).toBeVisible();

  await secondCard.getByRole('link', { name: 'Edit plan' }).click();
  const seriesPosition = page.getByRole('region', { name: 'Lesson series position' });
  await expect(
    seriesPosition.getByText('Lesson 2 of 2 in “Synthetic lesson series”', { exact: true }),
  ).toBeVisible();
  await seriesPosition.getByRole('button', { name: 'Move earlier' }).click();
  await expect(
    seriesPosition.getByText('Lesson 1 of 2 in “Synthetic lesson series”', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Learners' }).click();

  const reorderedPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await reorderedPlanning.getByRole('tab', { name: /Unscheduled/ }).click();
  await expect(
    reorderedPlanning
      .getByLabel('Series lesson two, Draft')
      .getByText('Lesson 1 of 2 in “Synthetic lesson series”', { exact: true }),
  ).toBeVisible();
  await expect(
    reorderedPlanning
      .getByLabel('Series lesson one, Draft')
      .getByText('Lesson 2 of 2 in “Synthetic lesson series”', { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    reorderedPlanning
      .getByLabel('Series lesson one, Draft')
      .getByText('Lesson 1 of 2 in “Synthetic lesson series”', { exact: true }),
  ).toBeVisible();
  await expect(
    reorderedPlanning
      .getByLabel('Series lesson two, Draft')
      .getByText('Lesson 2 of 2 in “Synthetic lesson series”', { exact: true }),
  ).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});

test('Scheduled lesson reordering swaps occupied session slots and remains undoable', async ({
  page,
}) => {
  await page.goto('./#/learners?date=2026-07-17');
  await seed(page);
  await seedScheduledReorderScenario(page);
  await page.reload();

  const planning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  const lessonA = planning.getByLabel('Reorder lesson A, Scheduled');
  const lessonB = planning.getByLabel('Reorder lesson B, Scheduled');
  await expect(lessonA.getByText('Friday, July 17, 2026')).toBeVisible();
  await expect(
    lessonA.getByText('Lesson 1 of 2 in “Synthetic reorder unit”', { exact: true }),
  ).toBeVisible();
  await expect(lessonB.getByText('Friday, July 24, 2026')).toBeVisible();

  await lessonA.getByRole('link', { name: 'Edit plan' }).click();
  const seriesPosition = page.getByRole('region', { name: 'Lesson series position' });
  await seriesPosition.getByRole('button', { name: 'Move later' }).click();
  await expect(
    seriesPosition.getByText('Lesson 2 of 2 in “Synthetic reorder unit”', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Learners' }).click();

  const reorderedPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await expect(
    reorderedPlanning.getByLabel('Reorder lesson A, Scheduled').getByText('Friday, July 24, 2026'),
  ).toBeVisible();
  await expect(
    reorderedPlanning
      .getByLabel('Reorder lesson A, Scheduled')
      .getByText('Lesson 2 of 2 in “Synthetic reorder unit”', { exact: true }),
  ).toBeVisible();
  await expect(
    reorderedPlanning.getByLabel('Reorder lesson B, Scheduled').getByText('Friday, July 17, 2026'),
  ).toBeVisible();
  await expect(
    reorderedPlanning
      .getByLabel('Reorder lesson B, Scheduled')
      .getByText('Lesson 1 of 2 in “Synthetic reorder unit”', { exact: true }),
  ).toBeVisible();

  await page.goto('./#/today?date=2026-07-17');
  await expect(
    page
      .locator('[data-today-item^="session-occurrence:"]')
      .filter({ hasText: 'Reorder lesson B' }),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-today-item^="session-occurrence:"]')
      .filter({ hasText: 'Reorder lesson A' }),
  ).toHaveCount(0);

  await page.goto('./#/week?date=2026-07-24&view=everything');
  await expect(
    page.locator('[data-week-item^="session-occurrence:"]').filter({ hasText: 'Reorder lesson A' }),
  ).toBeVisible();

  await page.goto('./#/calendar?date=2026-07-17');
  await expect(
    page
      .locator('[data-calendar-item^="session-occurrence:"]')
      .filter({ hasText: 'Reorder lesson B' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.goto('./#/learners?date=2026-07-17');
  const restoredPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await expect(
    restoredPlanning.getByLabel('Reorder lesson A, Scheduled').getByText('Friday, July 17, 2026'),
  ).toBeVisible();
  await expect(
    restoredPlanning.getByLabel('Reorder lesson B, Scheduled').getByText('Friday, July 24, 2026'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(
    restoredPlanning.getByLabel('Reorder lesson A, Scheduled').getByText('Friday, July 24, 2026'),
  ).toBeVisible();
  await expect(
    restoredPlanning.getByLabel('Reorder lesson B, Scheduled').getByText('Friday, July 17, 2026'),
  ).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});

test('Bump previews and shifts one lesson series across a Friday cancellation and Saturday addition', async ({
  page,
}) => {
  await page.goto('./#/learners?date=2026-07-17');
  await seed(page);
  await seedBumpScenario(page);
  await page.reload();

  const planning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  const firstCard = planning.getByLabel('Bump lesson one, Scheduled');
  await expect(firstCard.getByText('Friday, July 17, 2026')).toBeVisible();
  await firstCard.getByRole('link', { name: 'Manage session' }).click();

  await page.getByRole('button', { name: 'Preview bump' }).click();
  const preview = page.getByRole('region', { name: 'Bump preview' });
  await expect(preview.getByText('2 sessions affected')).toBeVisible();
  await expect(preview.getByText(/Saturday, July 25, 2026/)).toBeVisible();
  await expect(preview.getByText(/Friday, August 7, 2026/)).toBeVisible();
  await expect(preview.getByText('Adjusted occurrence')).toBeVisible();
  await preview.getByRole('button', { name: 'Confirm bump' }).click();

  await expect(page).toHaveURL(/planning=upcoming&date=2026-07-25/);
  const movedPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await expect(
    movedPlanning.getByLabel('Bump lesson one, Scheduled').getByText('Saturday, July 25, 2026'),
  ).toBeVisible();
  await expect(
    movedPlanning.getByLabel('Bump lesson two, Scheduled').getByText('Friday, August 7, 2026'),
  ).toBeVisible();

  await page.goto('./#/today?date=2026-07-25');
  await expect(
    page.locator('[data-today-item^="session-occurrence:"]').filter({ hasText: 'Bump lesson one' }),
  ).toBeVisible();

  await page.goto('./#/week?date=2026-07-25&view=everything');
  const weekends = page.getByRole('checkbox', { name: 'Weekends' });
  await weekends.check();
  await expect(weekends).toBeChecked();
  await expect(
    page.locator('[data-week-item^="session-occurrence:"]').filter({ hasText: 'Bump lesson one' }),
  ).toBeVisible();

  await page.goto('./#/calendar?date=2026-07-25');
  await expect(
    page
      .locator('[data-calendar-item^="session-occurrence:"]')
      .filter({ hasText: 'Bump lesson one' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.goto('./#/learners?date=2026-07-17');
  const restoredPlanning = page.getByRole('region', {
    name: 'Planning for Synthetic planning class',
  });
  await expect(
    restoredPlanning.getByLabel('Bump lesson one, Scheduled').getByText('Friday, July 17, 2026'),
  ).toBeVisible();
  await expect(
    restoredPlanning.getByLabel('Bump lesson two, Scheduled').getByText('Friday, July 31, 2026'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(
    restoredPlanning.getByLabel('Bump lesson one, Scheduled').getByText('Saturday, July 25, 2026'),
  ).toBeVisible();
  await expect(
    restoredPlanning.getByLabel('Bump lesson two, Scheduled').getByText('Friday, August 7, 2026'),
  ).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
