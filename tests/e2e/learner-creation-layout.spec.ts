import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seedLearnerDirectory(page: Page): Promise<void> {
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
          id: 'learner-layout-year',
          label: 'Synthetic 2026–2027',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          active: true,
          lifecycleState: 'active',
        });
        transaction.objectStore('learnerContexts').put({
          id: 'learner-layout-class',
          kind: 'class',
          name: 'Layout Grade 3',
          schoolYearId: 'learner-layout-year',
          status: 'active',
        });
      });
    } finally {
      database.close();
    }
  });
}

test('Learners provides a searchable directory, creation flow, and tabbed selected workspace', async ({
  page,
}) => {
  await page.goto('./#/learners?date=2026-07-22');
  await seedLearnerDirectory(page);
  await page.reload();

  const directory = page.getByRole('region', { name: 'Learner contexts' });
  await expect(directory.getByLabel('Search learners')).toBeVisible();
  await expect(directory.getByRole('button', { name: 'Open Layout Grade 3 class' })).toBeVisible();

  const addMenu = page.getByRole('group', { name: 'Add learner context options' });
  await page.getByLabel('Add learner context', { exact: true }).click();
  await addMenu.getByRole('button', { name: /Add Individual/ }).click();

  const createPanel = page.getByRole('region', { name: 'Add Individual' });
  await createPanel.getByLabel('Name *').fill('Anna Wang');
  await createPanel.getByLabel('Preferred name').fill('Anna');
  await createPanel.getByLabel('Notes').fill('Reading support and family communication notes.');
  await createPanel.getByRole('button', { name: 'Add Individual' }).click();

  await expect(page.getByRole('heading', { name: 'Anna Wang' })).toBeVisible();
  await expect(page).toHaveURL(/context=/);
  await expect(directory.getByRole('button', { name: 'Open Anna Wang individual' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Planning', selected: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Details' }).click();
  const details = page.getByRole('region', { name: 'Anna Wang details' });
  await expect(details.getByText('Anna', { exact: true })).toBeVisible();
  await expect(details.getByText('Reading support and family communication notes.')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(directory.getByRole('button', { name: 'Open Anna Wang individual' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(directory.getByRole('button', { name: 'Open Anna Wang individual' })).toBeVisible();

  await directory.getByLabel('Search learners').fill('Anna');
  await expect(directory.getByRole('button', { name: 'Open Anna Wang individual' })).toBeVisible();
  await expect(directory.getByRole('button', { name: 'Open Layout Grade 3 class' })).toHaveCount(0);
  await directory.getByLabel('Search learners').fill('');
  await directory.getByRole('button', { name: 'Classes' }).click();
  await expect(directory.getByRole('button', { name: 'Open Layout Grade 3 class' })).toBeVisible();
  await expect(directory.getByRole('button', { name: 'Open Anna Wang individual' })).toHaveCount(0);
  await directory.getByRole('button', { name: 'All' }).click();

  const directoryMore = directory.getByLabel('More actions for Anna Wang');
  const directoryActions = page.getByRole('group', { name: 'Actions for Anna Wang' });

  await page.getByLabel('Add learner context', { exact: true }).click();
  await directoryMore.click();
  await expect(addMenu).toBeHidden();
  await expect(directoryActions).toBeVisible();

  await directoryMore.press('Escape');
  await expect(directoryActions).toBeHidden();
  await expect(directoryMore).toBeFocused();

  await directoryMore.click();
  await directoryActions.getByRole('button', { name: 'Open support & notices' }).click();
  await expect(page.getByRole('tab', { name: 'Support & Notices', selected: true })).toBeVisible();

  await directoryMore.click();
  await directoryActions.getByRole('button', { name: 'Manage details & lifecycle' }).click();
  await expect(page.getByRole('tab', { name: 'Details', selected: true })).toBeVisible();

  await page.setViewportSize({ width: 1240, height: 800 });

  await expect(directory).toBeVisible();
  const selectedWorkspace = page.getByRole('region', { name: 'Planning for Anna Wang' });
  await expect(selectedWorkspace).toBeVisible();

  const [sidebarBox, directoryBox, selectedWorkspaceBox] = await Promise.all([
    page.getByRole('complementary', { name: 'Primary navigation' }).boundingBox(),
    directory.boundingBox(),
    selectedWorkspace.boundingBox(),
  ]);

  expect(sidebarBox).not.toBeNull();
  expect(directoryBox).not.toBeNull();
  expect(selectedWorkspaceBox).not.toBeNull();
  expect(sidebarBox!.width).toBeLessThanOrEqual(100);
  expect(directoryBox!.width).toBeGreaterThanOrEqual(280);
  expect(selectedWorkspaceBox!.width).toBeGreaterThanOrEqual(520);
  expect(directoryBox!.x + directoryBox!.width).toBeLessThanOrEqual(selectedWorkspaceBox!.x - 8);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Learner contexts' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Selected learner context' })).toContainText(
    'Anna Wang',
  );
  await expect(page.getByRole('tab', { name: 'Details', selected: true })).toBeVisible();
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
