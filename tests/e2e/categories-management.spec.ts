import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function openMoreActions(page: Page, valueName: string): Promise<void> {
  await page
    .getByRole('article', { name: `${valueName} category value` })
    .getByLabel(`More actions for ${valueName}`)
    .click();
}

async function seedPurposeTagUse(page: Page, valueName: string): Promise<void> {
  await page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      const value = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const transaction = database.transaction('categoryValues', 'readonly');
        const request = transaction.objectStore('categoryValues').getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () =>
          resolve(
            (request.result as Array<Record<string, unknown>>).find(
              (candidate) => candidate.name === name,
            ),
          );
      });
      if (!value || typeof value.id !== 'string') throw new Error('Category value not found.');

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['lessonPlans', 'categoryAssignments'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('lessonPlans').put({
          id: 'category-e2e-plan',
          contextId: 'category-e2e-class',
          title: 'Reading practice',
          subject: 'ELA',
          workflowState: 'draft',
          createdAt: '2026-07-22T01:00:00.000Z',
          updatedAt: '2026-07-22T01:00:00.000Z',
        });
        transaction.objectStore('categoryAssignments').put({
          id: 'category-e2e-assignment',
          familyId: 'purpose-tag',
          categoryValueId: value.id,
          entityType: 'lesson-plan',
          entityId: 'category-e2e-plan',
          createdAt: '2026-07-22T01:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  }, valueName);
}

test('Categories manages stable values and resolves in-use values transactionally', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/categories?family=purpose-tag');

  await expect(page.getByRole('heading', { level: 1, name: 'Categories & Labels' })).toBeVisible();
  const navigation = page.getByRole('complementary', { name: 'Primary navigation' });
  await expect(navigation.getByRole('button', { name: 'Resources' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(
    navigation.getByRole('link', { name: 'Categories & Labels', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'New Purpose Tag' }).click();
  let editor = page.getByRole('region', { name: 'Category value editor' });
  await editor.getByLabel('Name').fill('Reading');
  await editor.getByLabel('Color').selectOption('blue');
  await editor.getByLabel('Icon').selectOption('target');
  await editor.getByRole('button', { name: 'Create value' }).click();
  await expect(page.getByText('Created “Reading”.')).toBeVisible();

  await page.getByRole('button', { name: 'New Purpose Tag' }).click();
  editor = page.getByRole('region', { name: 'Category value editor' });
  await editor.getByLabel('Name').fill('Speaking');
  await editor.getByRole('button', { name: 'Create value' }).click();

  const reading = page.getByRole('article', { name: 'Reading category value' });
  const speaking = page.getByRole('article', { name: 'Speaking category value' });
  await expect(reading).toBeVisible();
  await expect(speaking).toBeVisible();
  await reading.getByRole('button', { name: 'Set default' }).click();
  await expect(reading).toContainText('Default');

  await speaking.getByRole('button', { name: 'Move Speaking earlier' }).click();
  await expect(page.getByRole('article').first()).toHaveAccessibleName('Speaking category value');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('article').first()).toHaveAccessibleName('Reading category value');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('article').first()).toHaveAccessibleName('Speaking category value');

  await openMoreActions(page, 'Reading');
  await reading.getByRole('button', { name: 'Edit', exact: true }).click();
  editor = page.getByRole('region', { name: 'Category value editor' });
  await editor.getByLabel('Name').fill('Reading practice');
  await editor.getByLabel('Color').selectOption('teal');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('article', { name: 'Reading practice category value' }),
  ).toContainText('Aliases: Reading');

  await seedPurposeTagUse(page, 'Reading practice');
  await page.reload();

  const inUseValue = page.getByRole('article', { name: 'Reading practice category value' });
  await expect(inUseValue).toContainText('1 use');
  await openMoreActions(page, 'Reading practice');
  await inUseValue.getByRole('button', { name: 'Resolve use' }).click();

  const resolution = page.getByRole('region', { name: 'Resolve category use' });
  await expect(resolution).toContainText('1 use must be moved');
  await resolution.getByLabel('Replacement value').selectOption({ label: 'Speaking' });
  await expect(resolution.getByLabel('Replace and Archive')).toBeChecked();
  page.once('dialog', (dialog) => dialog.accept());
  await resolution.getByRole('button', { name: 'Replace and archive' }).click();
  await expect(
    page.getByText('Replace and archive completed for “Reading practice”.'),
  ).toBeVisible();
  await expect(page.getByRole('article', { name: 'Speaking category value' })).toContainText(
    '1 use',
  );

  await page.getByRole('button', { name: /Archived/ }).click();
  await expect(
    page.getByRole('article', { name: 'Reading practice category value' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: /Active/ }).click();
  await expect(
    page.getByRole('article', { name: 'Reading practice category value' }),
  ).toContainText('1 use');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Category family')).toBeVisible();
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
