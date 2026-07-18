import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const records = {
  schoolYears: [
    {
      id: 'phase-3c6b-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'phase-3c6b-class',
      kind: 'class',
      name: 'Default Grade 3',
      schoolYearId: 'phase-3c6b-year',
      status: 'active',
    },
    {
      id: 'phase-3c6b-group',
      kind: 'group',
      name: 'Flexible Reading Group',
      schoolYearId: 'phase-3c6b-year',
      status: 'active',
    },
    {
      id: 'phase-3c6b-individual',
      kind: 'individual',
      name: 'Flexible Individual',
      schoolYearId: 'phase-3c6b-year',
      status: 'active',
    },
  ],
  scheduleBlocks: [
    {
      id: 'phase-3c6b-block',
      contextId: 'phase-3c6b-class',
      title: 'Friday language block',
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
  scheduleExceptions: [
    {
      id: 'phase-3c6b-adjustment',
      date: '2026-07-17',
      scheduleBlockId: 'phase-3c6b-block',
      action: 'modify',
      replacementStartMinute: 600,
      replacementEndMinute: 660,
      replacementTitle: 'Adjusted Friday language block',
    },
  ],
};

async function seedStores(page: Page, values: Record<string, readonly unknown[]>): Promise<void> {
  await page.evaluate(async (seedRecords) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(Object.keys(seedRecords), 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        for (const [storeName, storeValues] of Object.entries(seedRecords)) {
          const store = transaction.objectStore(storeName);
          for (const value of storeValues) store.put(value);
        }
      });
    } finally {
      database.close();
    }
  }, values);
}

async function storeCount(page: Page, storeName: string): Promise<number> {
  return page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      return await new Promise<number>((resolve, reject) => {
        const transaction = database.transaction(name, 'readonly');
        const request = transaction.objectStore(name).count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    } finally {
      database.close();
    }
  }, storeName);
}

async function seed(page: Page): Promise<void> {
  await seedStores(page, records);
}

test('Plan this block uses occurrence time, flexible contexts, duplicate protection, and one synchronized Session', async ({
  page,
}) => {
  await page.goto('./#/today?date=2026-07-17');
  await seed(page);
  await page.reload();

  const scheduleCard = page.locator(
    '[data-today-item="schedule-block:phase-3c6b-block:2026-07-17"]',
  );
  await expect(scheduleCard).toContainText('Adjusted Friday language block');
  await expect(scheduleCard).toContainText('10:00 AM');
  const planThisBlock = scheduleCard.getByRole('link', {
    name: 'Plan Adjusted Friday language block on 2026-07-17',
  });
  await expect(planThisBlock).toHaveAttribute(
    'href',
    '#/planning/edit?date=2026-07-17&return=today&block=phase-3c6b-block',
  );
  await planThisBlock.click();

  await expect(page.getByRole('heading', { name: 'Choose who this lesson is for' })).toBeVisible();
  await expect(page.getByLabel('Selected schedule occurrence')).toContainText(
    'Adjusted Friday language block',
  );
  await expect(page.getByLabel('Selected schedule occurrence')).toContainText('10:00 AM–11:00 AM');
  const contextSelect = page.getByLabel('Learner context');
  await expect(contextSelect).toHaveValue('phase-3c6b-class');
  await expect(contextSelect.locator('option:checked')).toContainText('Suggested');
  await contextSelect.selectOption('phase-3c6b-group');
  await page.getByRole('button', { name: 'Continue to plan' }).click();

  await expect(page.getByRole('heading', { name: 'New plan' })).toBeVisible();
  await expect(page.getByText('Flexible Reading Group', { exact: true })).toBeVisible();
  await expect(
    page.getByLabel('Planning Adjusted Friday language block on 2026-07-17'),
  ).toContainText('10:00 AM–11:00 AM');
  await expect(page.getByLabel('Preferred schedule block')).toBeDisabled();
  await expect(page.getByLabel('Preferred schedule block')).toHaveValue('phase-3c6b-block');
  await page.getByLabel('Title').fill('Group occurrence lesson');
  await page.getByLabel('Subject').fill('Language');
  await page.getByLabel('Planning state').selectOption('ready');
  await page.getByRole('button', { name: 'Save plan to block' }).click();

  await expect(page).toHaveURL(/#\/today\?date=2026-07-17/);
  await expect(scheduleCard).toContainText('Group occurrence lesson');
  await expect(scheduleCard).toContainText('Flexible Reading Group');
  await expect(scheduleCard.locator('[data-today-item^="session-occurrence:"]')).toHaveCount(1);
  await expect(page.locator('ol > li[data-today-item^="session-occurrence:"]')).toHaveCount(0);
  await expect.poll(() => storeCount(page, 'lessonPlans')).toBe(1);
  await expect.poll(() => storeCount(page, 'sessionOccurrences')).toBe(1);

  await scheduleCard
    .getByRole('link', { name: 'Plan Adjusted Friday language block on 2026-07-17' })
    .click();
  await page.getByLabel('Learner context').selectOption('phase-3c6b-group');
  await page.getByRole('button', { name: 'Continue to plan' }).click();
  await expect(page.getByRole('heading', { name: 'Edit plan' })).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Group occurrence lesson');
  await expect(page.getByRole('link', { name: 'Manage session' })).toBeVisible();
  await expect.poll(() => storeCount(page, 'lessonPlans')).toBe(1);
  await expect.poll(() => storeCount(page, 'sessionOccurrences')).toBe(1);

  await page.getByRole('button', { name: 'Change context' }).click();
  await page.getByLabel('Learner context').selectOption('phase-3c6b-individual');
  await page.getByRole('button', { name: 'Continue to plan' }).click();
  await page.getByLabel('Title').fill('Individual occurrence lesson');
  await page.getByRole('button', { name: 'Save plan to block' }).click();

  await expect(page).toHaveURL(/#\/today\?date=2026-07-17/);
  await expect(scheduleCard).toContainText('Group occurrence lesson');
  await expect(scheduleCard).toContainText('Individual occurrence lesson');
  await expect(scheduleCard.locator('[data-today-item^="session-occurrence:"]')).toHaveCount(2);
  await expect.poll(() => storeCount(page, 'lessonPlans')).toBe(2);
  await expect.poll(() => storeCount(page, 'sessionOccurrences')).toBe(2);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(scheduleCard).not.toContainText('Individual occurrence lesson');
  await expect(scheduleCard).toContainText('Group occurrence lesson');
  await expect.poll(() => storeCount(page, 'lessonPlans')).toBe(1);
  await expect.poll(() => storeCount(page, 'sessionOccurrences')).toBe(1);

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(scheduleCard).toContainText('Individual occurrence lesson');
  await expect.poll(() => storeCount(page, 'lessonPlans')).toBe(2);
  await expect.poll(() => storeCount(page, 'sessionOccurrences')).toBe(2);

  await page.goto('./#/learners?context=phase-3c6b-group&planning=upcoming&date=2026-07-17');
  await expect(
    page
      .getByRole('region', { name: 'Planning for Flexible Reading Group' })
      .getByLabel('Group occurrence lesson, Scheduled'),
  ).toBeVisible();

  await page.goto('./#/calendar?date=2026-07-17');
  await expect(
    page.locator('[data-calendar-item^="session-occurrence:"]').filter({
      hasText: 'Group occurrence lesson',
    }),
  ).toBeVisible();

  await page.goto('./#/week?date=2026-07-24&view=everything');
  const nextOccurrence = page.locator(
    '[data-week-item="schedule-block:phase-3c6b-block:2026-07-24"]',
  );
  await nextOccurrence
    .getByRole('link', { name: 'Plan Friday language block on 2026-07-24' })
    .click();
  await page.getByLabel('Learner context').selectOption('phase-3c6b-class');
  await page.getByRole('button', { name: 'Continue to plan' }).click();
  await page.getByLabel('Title').fill('Week return occurrence lesson');
  await page.getByRole('button', { name: 'Save plan to block' }).click();

  await expect(page).toHaveURL(/#\/week\?/);
  await expect(page).toHaveURL(/date=2026-07-24/);
  await expect(page).toHaveURL(/view=everything/);
  await expect(page).toHaveURL(/focus=schedule-block%3Aphase-3c6b-block%3A2026-07-24/);
  await expect(nextOccurrence).toHaveAttribute('aria-current', 'true');
  await expect(nextOccurrence).toContainText('Week return occurrence lesson');

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
