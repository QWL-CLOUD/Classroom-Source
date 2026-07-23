import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seedNavigationContext(page: Page): Promise<void> {
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
          id: 'phase-3d-5b-5-year',
          label: 'Synthetic 2026–2027',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          active: true,
        });
        transaction.objectStore('learnerContexts').put({
          id: 'phase-3d-5b-5-class',
          kind: 'class',
          name: 'Cross-route Grade 3',
          schoolYearId: 'phase-3d-5b-5-year',
          status: 'active',
        });
      });
    } finally {
      database.close();
    }
  });
}

test('workspace navigation preserves context and final focus patterns stay accessible', async ({
  page,
}) => {
  await page.goto('./#/today?date=2026-07-20');
  await seedNavigationContext(page);
  await page.reload();

  await expect(page).toHaveTitle('Today · Classroom');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await skipLink.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page).toHaveURL(/#\/tasks\?date=2026-07-20$/);
  await expect(page).toHaveTitle('Tasks · Classroom');

  const newTaskButton = page.getByRole('button', { name: 'New task' });
  await expect(newTaskButton).toHaveCount(1);
  await newTaskButton.click();
  const newTask = page.getByRole('region', { name: 'New task' });
  await expect(newTask.getByRole('textbox', { name: 'Task title' })).toBeFocused();
  await expect(newTask.getByRole('group', { name: 'Scheduled' }).getByLabel('Date')).toHaveValue(
    '2026-07-20',
  );
  await newTask.getByRole('button', { name: 'Cancel' }).click();
  await expect(newTaskButton).toBeFocused();

  await page.goto(
    './#/learners?date=2026-07-20&context=phase-3d-5b-5-class&status=active&planning=upcoming',
  );
  await expect(
    page.getByRole('region', { name: 'Planning for Cross-route Grade 3' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(
    /#\/today\?date=2026-07-20&context=phase-3d-5b-5-class&status=active&planning=upcoming$/,
  );
  await page.getByRole('link', { name: 'Learners', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Planning for Cross-route Grade 3' }),
  ).toBeVisible();

  await page.goto('./#/calendar/edit?date=2026-07-20');
  await expect(page.getByText('Calendar events', { exact: true })).toBeVisible();
  await expect(page.getByText(/Phase 2F/)).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library');
  await expect(page).toHaveTitle('Library · Classroom');
  const libraryMain = page.locator('#main-content');
  await expect(libraryMain.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await expect(libraryMain.getByRole('button', { name: 'New Library item' })).toBeVisible();
  await expect(libraryMain.getByRole('region', { name: 'Library catalog filters' })).toBeVisible();
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
