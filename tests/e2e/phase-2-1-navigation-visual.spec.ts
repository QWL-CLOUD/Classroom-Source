import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const records = {
  schoolYears: [
    {
      id: 'phase-21-school-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'phase-21-context',
      kind: 'individual',
      name: 'Synthetic learner',
      schoolYearId: 'phase-21-school-year',
      status: 'active',
    },
  ],
  scheduleBlocks: [
    {
      id: 'phase-21-arrival',
      title: 'Synthetic arrival',
      subject: '',
      category: 'Routine',
      kind: 'routine',
      weekdays: [3],
      startMinute: 485,
      endMinute: 510,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-08-31',
      planningEnabled: false,
      bumpEnabled: false,
      showInWeek: true,
      sortOrder: 0,
    },
  ],
  calendarEvents: [
    {
      id: 'phase-21-event',
      title: 'Synthetic staff event',
      startDate: '2026-07-15',
      startMinute: 600,
      endMinute: 660,
      category: 'Meeting',
      source: 'synthetic-e2e',
    },
    {
      id: 'phase-21-personal',
      title: 'Synthetic personal appointment',
      startDate: '2026-07-15',
      startMinute: 900,
      endMinute: 930,
      category: 'Personal',
      source: 'synthetic-e2e',
    },
  ],
  lessonPlans: [
    {
      id: 'phase-21-plan',
      contextId: 'phase-21-context',
      title: 'Synthetic learner session',
      subject: 'Conference',
      workflowState: 'ready',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-15T12:00:00.000Z',
    },
  ],
  sessionOccurrences: [
    {
      id: 'phase-21-session',
      lessonPlanId: 'phase-21-plan',
      contextId: 'phase-21-context',
      date: '2026-07-15',
      startMinute: 660,
      endMinute: 690,
      deliveryState: 'scheduled',
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

        for (const [storeName, entries] of Object.entries(values)) {
          const store = transaction.objectStore(storeName);
          for (const entry of entries) store.put(entry);
        }
      });
    } finally {
      database.close();
    }
  }, records);
}

test('Phase 2.1 preserves Week view and focus while keeping time labels readable', async ({
  page,
}) => {
  await page.goto('./#/system-health');
  await seed(page);
  await page.goto(
    './#/week?date=2026-07-15&view=everything&focus=session-occurrence%3Aphase-21-session',
  );

  await expect(page.getByLabel('View')).toHaveValue('everything');
  const focusedSession = page.locator('[data-week-item="session-occurrence:phase-21-session"]');
  await expect(focusedSession).toBeVisible();
  await expect(focusedSession).toHaveAttribute('aria-current', 'true');
  await expect(focusedSession.getByText('Synthetic learner session')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('View')).toHaveValue('everything');
  await expect(focusedSession).toHaveAttribute('aria-current', 'true');

  const weekGrid = page.getByRole('region', { name: /Week of/ });
  const requestedScrollLeft = await weekGrid.evaluate((element) => {
    const target = Math.min(180, element.scrollWidth - element.clientWidth);
    element.scrollLeft = target;
    return target;
  });
  await expect
    .poll(async () =>
      Math.abs((await weekGrid.evaluate((element) => element.scrollLeft)) - requestedScrollLeft),
    )
    .toBeLessThanOrEqual(5);

  const manualScrollLeft = await weekGrid.evaluate((element) => {
    element.scrollLeft = element.scrollWidth - element.clientWidth;
    return element.scrollLeft;
  });
  await page.getByRole('checkbox', { name: 'Weekends' }).click();
  await expect
    .poll(() => weekGrid.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(manualScrollLeft - 10);

  await page.getByLabel('View').selectOption('teaching');
  await expect(page).toHaveURL(/view=schedule$/);
  await expect(page.getByText('Synthetic arrival')).toBeVisible();
  await expect(page.getByText('Synthetic staff event')).toHaveCount(0);
  await expect(page.getByText('Synthetic learner session')).toHaveCount(0);

  const arrivalTime = page.locator('[data-week-time]', { hasText: '8:05 AM–8:30 AM' });
  await expect(arrivalTime).toBeVisible();
  expect(await arrivalTime.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);

  await page.getByLabel('View').selectOption('calendar');
  await expect(page).toHaveURL(/view=events$/);
  await expect(page.getByText('Synthetic staff event')).toBeVisible();
  await expect(page.getByText('Synthetic personal appointment')).toHaveCount(0);

  await page.getByLabel('View').selectOption('personal');
  await expect(page).toHaveURL(/view=personal$/);
  await expect(page.getByText('Synthetic personal appointment')).toBeVisible();
  await expect(page.getByText('Synthetic staff event')).toHaveCount(0);

  await page.getByLabel('View').selectOption('everything');
  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
