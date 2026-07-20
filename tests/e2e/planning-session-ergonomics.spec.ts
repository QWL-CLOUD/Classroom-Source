import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const records = {
  schoolYears: [
    {
      id: 'phase-3d-5b-3-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'phase-3d-5b-3-context',
      kind: 'class',
      name: 'Synthetic ergonomics class',
      schoolYearId: 'phase-3d-5b-3-year',
      status: 'active',
    },
  ],
  scheduleBlocks: [
    {
      id: 'phase-3d-5b-3-block',
      contextId: 'phase-3d-5b-3-context',
      title: 'Synthetic ergonomics block',
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

test('Lesson Flow supports adjacent creation, duplication, reordering, and focused long-form editing', async ({
  page,
}) => {
  await page.goto('./#/learners?date=2026-07-17');
  await seed(page);
  await page.reload();

  const planning = page.getByRole('region', {
    name: 'Planning for Synthetic ergonomics class',
  });
  await planning.getByRole('link', { name: 'New plan' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'New plan' })).toBeVisible();
  await expect(page.getByText('Phase 3C-6B')).toHaveCount(0);
  await page.getByLabel('Title').fill('Ergonomic lesson flow');
  await page.getByLabel('Planning state').selectOption('ready');
  await page.getByLabel('Preferred schedule block').selectOption('phase-3d-5b-3-block');

  await page.getByRole('button', { name: 'Add step' }).click();
  await expect(page.getByLabel('Step title')).toBeFocused();
  await page.getByLabel('Step title').fill('Opening');

  await page.getByRole('button', { name: 'Add step' }).click();
  await expect(page.getByLabel('Step title').nth(1)).toBeFocused();
  await page.getByLabel('Step title').nth(1).fill('Practice');

  await page.locator('summary[aria-label="Step 1 actions"]').click();
  await page.getByRole('button', { name: 'Add after' }).click();
  await expect(page.getByLabel('Step title').nth(1)).toBeFocused();
  await page.getByLabel('Step title').nth(1).fill('Guided check');

  await page.locator('summary[aria-label="Step 2 actions"]').click();
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByLabel('Step title').nth(2)).toBeFocused();
  await expect(page.getByLabel('Step title').nth(2)).toHaveValue('Guided check copy');

  await page.locator('summary[aria-label="Step 3 actions"]').click();
  await page.getByRole('button', { name: 'Move later' }).click();
  await expect(page.getByLabel('Step title').nth(3)).toHaveValue('Guided check copy');

  await page.locator('summary[aria-label="Step 4 actions"]').click();
  await page.getByRole('button', { name: 'Delete step' }).click();
  await expect(page.getByLabel('Step title')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Add step' })).toBeVisible();

  await page.getByRole('button', { name: 'Save and schedule' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Session' })).toBeVisible();

  // A plan created from Learners is initially unscheduled and does not inherit
  // the Learners anchor date. Choose a valid Friday occurrence for the preferred
  // Friday Schedule Block before scheduling the Session.
  await page.getByRole('textbox', { name: 'Date', exact: true }).fill('2026-07-17');
  await expect(page.getByRole('button', { name: 'Schedule session' })).toBeEnabled();
  await page.getByRole('button', { name: 'Schedule session' }).click();

  const scheduled = page
    .getByRole('region', { name: 'Planning for Synthetic ergonomics class' })
    .getByLabel('Ergonomic lesson flow, Scheduled');
  await scheduled.getByRole('link', { name: 'Manage session' }).click();

  const editorActions = page.getByRole('group', { name: 'Editor actions', exact: true });
  await expect(editorActions.getByRole('button', { name: 'Save session' })).toBeVisible();
  await editorActions.locator('summary').click();
  await expect(editorActions.getByRole('button', { name: 'Return to Unscheduled' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editorActions).toBeVisible();
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
