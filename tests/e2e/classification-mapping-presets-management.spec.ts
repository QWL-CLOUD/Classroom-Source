import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type SeedValue = {
  id: string;
  familyId: string;
  name: string;
  sortOrder: number;
};

async function seedControlledValues(page: Page, values: SeedValue[]): Promise<void> {
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('categoryValues', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        const store = transaction.objectStore('categoryValues');
        for (const record of records) {
          store.put({
            ...record,
            normalizedName: record.name.toLocaleLowerCase('en-US'),
            aliases: [],
            normalizedAliases: [],
            isDefault: false,
            lifecycleState: 'active',
            createdAt: '2026-08-03T20:00:00.000Z',
            updatedAt: '2026-08-03T20:00:00.000Z',
          });
        }
      });
    } finally {
      database.close();
    }
  }, values);
}

async function createMapping(page: Page, sourceText: string, targetLabel: string): Promise<void> {
  await page.getByRole('button', { name: 'New import mapping' }).click();
  const editor = page.getByRole('region', { name: 'Import mapping editor' });
  await editor.getByLabel('External text').fill(sourceText);
  await editor.getByLabel('Controlled target').selectOption({ label: targetLabel });
  await editor.getByRole('button', { name: 'Create mapping' }).click();
}

async function chooseFamily(page: Page, name: RegExp): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Category families' })
    .getByRole('button', { name })
    .click();
}

test('classification mapping presets support family-scoped CRUD and global history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/categories?family=subject&mode=mappings');
  await seedControlledValues(page, [
    { id: 'mapping-subject-ela', familyId: 'subject', name: 'English Language Arts', sortOrder: 0 },
    { id: 'mapping-subject-math', familyId: 'subject', name: 'Mathematics', sortOrder: 1 },
    {
      id: 'mapping-purpose-communication',
      familyId: 'purpose-tag',
      name: 'Communication',
      sortOrder: 0,
    },
  ]);
  await page.reload();

  await createMapping(page, 'ELA', 'English Language Arts');
  let mapping = page.getByRole('article', { name: 'ELA import mapping' });
  await expect(mapping).toContainText('Maps to English Language Arts');
  await expect(mapping).toContainText('Ready');

  await mapping.getByRole('button', { name: 'Deactivate' }).click();
  await expect(mapping).toContainText('Inactive');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(mapping.getByRole('button', { name: 'Deactivate' })).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(mapping.getByRole('button', { name: 'Activate' })).toBeVisible();
  await mapping.getByRole('button', { name: 'Activate' }).click();

  await mapping.getByRole('button', { name: 'Edit' }).click();
  const editor = page.getByRole('region', { name: 'Import mapping editor' });
  await editor.getByLabel('External text').fill('District ELA');
  await editor.getByLabel('Controlled target').selectOption({ label: 'Mathematics' });
  await editor.getByRole('button', { name: 'Save mapping' }).click();
  mapping = page.getByRole('article', { name: 'District ELA import mapping' });
  await expect(mapping).toContainText('Maps to Mathematics');

  await chooseFamily(page, /Purpose Tags/);
  await createMapping(page, 'District ELA', 'Communication');
  await expect(page.getByRole('article', { name: 'District ELA import mapping' })).toContainText(
    'Maps to Communication',
  );

  await chooseFamily(page, /Subjects/);
  mapping = page.getByRole('article', { name: 'District ELA import mapping' });
  page.once('dialog', (dialog) => dialog.accept());
  await mapping.getByRole('button', { name: 'Delete' }).click();
  await expect(mapping).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('article', { name: 'District ELA import mapping' })).toBeVisible();

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

test('replacing a controlled target retargets its mappings in the same undoable action', async ({
  page,
}) => {
  await page.goto('./#/categories?family=subject&mode=mappings');
  await seedControlledValues(page, [
    { id: 'mapping-source-subject', familyId: 'subject', name: 'Source Subject', sortOrder: 0 },
    {
      id: 'mapping-replacement-subject',
      familyId: 'subject',
      name: 'Replacement Subject',
      sortOrder: 1,
    },
  ]);
  await page.reload();
  await createMapping(page, 'External Subject', 'Source Subject');

  await page
    .getByRole('group', { name: 'Category workspace mode' })
    .getByRole('button', { name: 'Controlled values' })
    .click();
  const source = page.getByRole('article', { name: 'Source Subject category value' });
  await expect(source).toContainText('1 import mapping');
  await source.getByLabel('More actions for Source Subject').click();
  await source.getByRole('button', { name: 'Resolve use' }).click();
  const resolution = page.getByRole('region', { name: 'Resolve category use' });
  await expect(resolution).toContainText('1 active import mapping');
  await resolution.getByLabel('Replacement value').selectOption({ label: 'Replacement Subject' });
  page.once('dialog', (dialog) => dialog.accept());
  await resolution.getByRole('button', { name: 'Replace and archive' }).click();

  await page
    .getByRole('group', { name: 'Category workspace mode' })
    .getByRole('button', { name: 'Import mappings' })
    .click();
  const mapping = page.getByRole('article', { name: 'External Subject import mapping' });
  await expect(mapping).toContainText('Maps to Replacement Subject');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(mapping).toContainText('Maps to Source Subject');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(mapping).toContainText('Maps to Replacement Subject');
});
