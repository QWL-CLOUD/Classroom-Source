import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const foundationRecords = {
  schoolYears: [
    {
      id: 'phase-3c4-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'phase-3c4-context',
      kind: 'class',
      name: 'Synthetic entry class',
      schoolYearId: 'phase-3c4-year',
      status: 'active',
    },
  ],
  scheduleBlocks: [
    {
      id: 'phase-3c4-block',
      contextId: 'phase-3c4-context',
      title: 'Synthetic Friday block',
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

async function seedStores(page: Page, values: Record<string, readonly unknown[]>): Promise<void> {
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(Object.keys(records), 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        for (const [storeName, storeValues] of Object.entries(records)) {
          const store = transaction.objectStore(storeName);
          for (const value of storeValues) store.put(value);
        }
      });
    } finally {
      database.close();
    }
  }, values);
}

async function seedFoundation(page: Page): Promise<void> {
  await seedStores(page, foundationRecords);
}

test('Today creates one dated lesson session and returns to the selected day', async ({ page }) => {
  await page.goto('./#/today?date=2026-07-17');
  await seedFoundation(page);
  await page.reload();

  await page.locator('summary[aria-label="Add to 2026-07-17"]').click();
  await page.getByRole('link', { name: /New plan/ }).click();
  await expect(page).toHaveURL(/#\/planning\/edit\?date=2026-07-17&return=today/);
  await expect(page.getByRole('heading', { name: 'Choose who this lesson is for' })).toBeVisible();
  await expect(
    page.getByText(
      'The session date will start on Friday, July 17, 2026 if you choose Save and schedule.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue to plan' }).click();

  await page.getByLabel('Title').fill('Today entry lesson');
  await page.getByLabel('Subject').fill('Language');
  await page.getByLabel('Planning state').selectOption('ready');
  await page.getByLabel('Preferred schedule block').selectOption('phase-3c4-block');
  await page.getByRole('button', { name: 'Save and schedule' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Session' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Date', exact: true })).toHaveValue('2026-07-17');
  await expect(page.getByLabel('Schedule block')).toHaveValue('phase-3c4-block');
  await page.getByRole('button', { name: 'Schedule session' }).click();

  await expect(page).toHaveURL(/#\/today\?date=2026-07-17/);
  const todayItem = page
    .locator('[data-today-item^="session-occurrence:"]')
    .filter({ hasText: 'Today entry lesson' });
  await expect(todayItem).toBeVisible();
  await todayItem.getByRole('link', { name: 'Manage Today entry lesson session' }).click();
  await expect(page.getByRole('link', { name: 'Back to Today' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Today' }).click();
  await expect(todayItem).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});

test('Week and Calendar expose date-specific lesson planning entry points', async ({ page }) => {
  await page.goto('./#/week?date=2026-07-17&view=everything');
  await seedFoundation(page);
  await page.reload();

  const weekEntry = page.getByRole('link', { name: /Add lesson plan to Friday/ });
  await expect(weekEntry).toHaveAttribute('href', '#/planning/edit?date=2026-07-17&return=week');
  await weekEntry.click();
  await expect(page).toHaveURL(/date=2026-07-17&return=week/);
  await page.getByRole('button', { name: 'Continue to plan' }).click();
  await expect(page.getByRole('link', { name: 'Back to Week' })).toBeVisible();

  await page.goto('./#/calendar?date=2026-07-17');
  const calendarEntry = page.getByRole('link', { name: /Add lesson plan to Friday, July 17/ });
  await expect(calendarEntry).toHaveAttribute(
    'href',
    '#/planning/edit?date=2026-07-17&return=calendar',
  );
  await calendarEntry.click();
  await page.getByRole('button', { name: 'Continue to plan' }).click();
  await expect(page.getByRole('link', { name: 'Back to Calendar' })).toBeVisible();
});

test('Learners deletes a scheduled plan with its session and Undo restores both', async ({
  page,
}) => {
  await page.goto('./#/learners?context=phase-3c4-context&planning=upcoming&date=2026-07-17');
  await seedFoundation(page);
  await seedStores(page, {
    lessonPlans: [
      {
        id: 'phase-3c4-delete-plan',
        contextId: 'phase-3c4-context',
        title: 'Delete from Learners',
        subject: 'Language',
        workflowState: 'ready',
        preferredScheduleBlockId: 'phase-3c4-block',
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-01T12:00:00.000Z',
      },
    ],
    sessionOccurrences: [
      {
        id: 'phase-3c4-delete-session',
        lessonPlanId: 'phase-3c4-delete-plan',
        contextId: 'phase-3c4-context',
        scheduleBlockId: 'phase-3c4-block',
        date: '2026-07-17',
        startMinute: 540,
        endMinute: 600,
        deliveryState: 'scheduled',
      },
    ],
  });
  await page.reload();

  const planning = page.getByRole('region', { name: 'Planning for Synthetic entry class' });
  const card = planning.getByLabel('Delete from Learners, Scheduled');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Delete plan' }).click();
  await expect(card.getByText(/will also be removed from Today, Week, and Calendar/)).toBeVisible();
  await card.getByRole('button', { name: 'Confirm delete plan and session' }).click();
  await expect(card).toHaveCount(0);

  await page.goto('./#/today?date=2026-07-17');
  await expect(page.getByText('Delete from Learners', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    page.locator('[data-today-item^="session-occurrence:"]').filter({
      hasText: 'Delete from Learners',
    }),
  ).toBeVisible();

  await page.goto('./#/learners?context=phase-3c4-context&planning=upcoming&date=2026-07-17');
  await expect(
    page
      .getByRole('region', { name: 'Planning for Synthetic entry class' })
      .getByLabel('Delete from Learners, Scheduled'),
  ).toBeVisible();
});
