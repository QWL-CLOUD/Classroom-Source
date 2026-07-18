import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const hierarchyBlocks = [
  {
    id: 'visual-parent',
    title: 'Synthetic Grade 3 Day',
    subject: '',
    category: 'Schedule',
    kind: 'container',
    weekdays: [1, 2, 3, 4, 5],
    startMinute: 480,
    endMinute: 960,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-07-31',
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 0,
  },
  {
    id: 'visual-arrival',
    parentId: 'visual-parent',
    title: 'Synthetic Arrival',
    subject: '',
    category: 'Routine',
    kind: 'routine',
    weekdays: [1, 2, 3, 4, 5],
    startMinute: 480,
    endMinute: 510,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-07-31',
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 1,
  },
  {
    id: 'visual-cla',
    parentId: 'visual-parent',
    title: 'Synthetic CLA',
    subject: '',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [1, 2, 3, 4, 5],
    startMinute: 570,
    endMinute: 660,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-07-31',
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 2,
  },
  {
    id: 'visual-orphan',
    parentId: 'missing-parent',
    title: 'Synthetic Orphan',
    subject: '',
    category: 'Schedule',
    kind: 'transition',
    weekdays: [1],
    startMinute: 720,
    endMinute: 750,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-07-31',
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 3,
  },
];

async function seedHierarchy(page: Page): Promise<void> {
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['scheduleBlocks', 'changeLog'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('scheduleBlocks').clear();
        transaction.objectStore('changeLog').clear();
        for (const record of records) transaction.objectStore('scheduleBlocks').put(record);
      });
    } finally {
      database.close();
    }
  }, hierarchyBlocks);
}

test('Schedule manager presents a stable parent-child hierarchy and safe parent choices', async ({
  page,
}) => {
  await page.goto('./#/schedule/edit?date=2026-07-13');
  await seedHierarchy(page);
  await page.reload();

  const hierarchyItems = page.locator('[data-schedule-id]');
  await expect(hierarchyItems).toHaveCount(4);
  await expect(hierarchyItems).toHaveAttribute('data-schedule-id', 'visual-parent');
  await expect(hierarchyItems.nth(1)).toHaveAttribute('data-schedule-id', 'visual-arrival');
  await expect(hierarchyItems.nth(2)).toHaveAttribute('data-schedule-id', 'visual-cla');
  await expect(hierarchyItems.nth(3)).toHaveAttribute('data-schedule-id', 'visual-orphan');

  const parentItem = page.locator('[data-schedule-id="visual-parent"]');
  const childItem = page.locator('[data-schedule-id="visual-arrival"]');
  await expect(parentItem).toHaveAttribute('data-child-count', '2');
  await expect(parentItem.getByText('2 children')).toBeVisible();
  await expect(childItem).toHaveAttribute('data-schedule-depth', '1');
  await expect(childItem.getByText('Part of Synthetic Grade 3 Day')).toBeVisible();
  await expect(page.locator('[data-schedule-id="visual-orphan"]')).toContainText(
    'Parent unavailable',
  );
  await expect(childItem).toHaveAttribute(
    'data-group-tone',
    (await parentItem.getAttribute('data-group-tone')) ?? '',
  );

  await parentItem.getByRole('link').click();
  await expect(page.getByRole('button', { name: 'Archive' })).toBeDisabled();
  await expect(page.getByText(/Reassign or archive 2 children/)).toBeVisible();
  const parentOptions = page.getByLabel('Parent block').locator('option');
  await expect(parentOptions.filter({ hasText: 'Synthetic Arrival' })).toHaveCount(0);
  await expect(parentOptions.filter({ hasText: 'Synthetic CLA' })).toHaveCount(0);

  await page.locator('[data-schedule-id="visual-arrival"]').getByRole('link').click();
  await expect(
    page.locator('form').getByText('Part of Synthetic Grade 3 Day', { exact: true }),
  ).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});

test('Week, Today, and Calendar preserve hierarchy cues without shifting the Today timeline rail', async ({
  page,
}) => {
  await page.goto('./#/week?date=2026-07-13&view=schedule');
  await seedHierarchy(page);
  await page.reload();

  const weekParent = page.locator('[data-week-item="schedule-block:visual-parent:2026-07-13"]');
  const weekChild = page.locator('[data-week-item="schedule-block:visual-arrival:2026-07-13"]');
  await expect(weekParent).toHaveAttribute('data-child-count', '2');
  await expect(weekParent.getByText('2 children')).toBeVisible();
  await expect(weekChild).toHaveAttribute('data-schedule-depth', '1');
  await expect(weekChild.getByText('Part of Synthetic Grade 3 Day')).toBeVisible();
  await expect(weekChild).toHaveAttribute(
    'data-group-tone',
    (await weekParent.getAttribute('data-group-tone')) ?? '',
  );

  await page.goto('./#/today?date=2026-07-13');
  const todayParent = page.locator('[data-schedule-id="visual-parent"]');
  const todayChild = page.locator('[data-schedule-id="visual-arrival"]');
  await expect(todayChild).toHaveAttribute('data-schedule-depth', '1');
  const parentTime = await todayParent.locator('[data-timeline-time]').boundingBox();
  const childTime = await todayChild.locator('[data-timeline-time]').boundingBox();
  const parentContent = await todayParent.locator('[data-timeline-content]').boundingBox();
  const childContent = await todayChild.locator('[data-timeline-content]').boundingBox();
  expect(parentTime?.x).toBe(childTime?.x);
  expect((childContent?.x ?? 0) - (parentContent?.x ?? 0)).toBeGreaterThanOrEqual(8);

  await page.goto('./#/calendar?date=2026-07-13');
  const calendarParent = page.locator(
    '[data-calendar-item="schedule-block:visual-parent:2026-07-13"]',
  );
  const calendarChild = page.locator(
    '[data-calendar-item="schedule-block:visual-arrival:2026-07-13"]',
  );
  await expect(calendarParent).toHaveAttribute('data-child-count', '2');
  await expect(calendarChild).toHaveAttribute('data-schedule-depth', '1');
  await expect(calendarChild.getByText('Part of Synthetic Grade 3 Day')).toBeVisible();
  await expect(calendarChild).toHaveAttribute(
    'data-group-tone',
    (await calendarParent.getAttribute('data-group-tone')) ?? '',
  );
});
