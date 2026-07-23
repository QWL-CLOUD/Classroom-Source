import { expect, test, type Page } from '@playwright/test';

async function seedResourceFormat(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        if (!database.objectStoreNames.contains('libraryItems')) {
          reject(new Error(`IndexedDB v${database.version} is missing the libraryItems store.`));
          return;
        }

        const transaction = database.transaction(['categoryValues'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        transaction.objectStore('categoryValues').put({
          id: 'format-slide-deck',
          familyId: 'resource-format',
          name: 'Slide deck',
          normalizedName: 'slide deck',
          aliases: [],
          normalizedAliases: [],
          sortOrder: 0,
          isDefault: false,
          lifecycleState: 'active',
          createdAt: '2026-07-23T12:00:00.000Z',
          updatedAt: '2026-07-23T12:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  });
}

test('Library Catalog creates, filters, edits, archives, and restores stable records', async ({
  page,
}) => {
  await page.goto('./#/library');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 6,
    );
  });
  await seedResourceFormat(page);
  await page.reload();

  await page.getByRole('button', { name: 'New Library item' }).click();
  const editor = page.getByRole('form', {
    name: 'Library catalog editor',
  });
  await editor.getByLabel('Catalog type').selectOption('resource');
  await editor.getByLabel('Title').fill('Weather vocabulary slides');
  await editor.getByLabel('Description').fill('Reusable picture prompts for oral language.');
  await editor.getByLabel('Tags').fill('Speaking, Weather');
  await editor.getByLabel('Slide deck').check();
  await editor.getByRole('button', { name: 'Create item' }).click();

  const details = page.getByRole('region', {
    name: 'Weather vocabulary slides Library item details',
  });
  await expect(details).toBeVisible();
  await expect(details.getByText('Slide deck', { exact: true })).toBeVisible();
  await expect(details.getByText('Speaking', { exact: true })).toBeVisible();

  await page.getByLabel('Type').selectOption('resource');
  await page.getByLabel('Resource Format').selectOption('format-slide-deck');
  await page.getByLabel('Search').fill('oral language');
  await expect(
    page.getByRole('button', {
      name: /Weather vocabulary slides/,
    }),
  ).toBeVisible();

  await details.getByRole('button', { name: 'Edit' }).click();
  const editEditor = page.getByRole('form', {
    name: 'Library catalog editor',
  });
  await editEditor.getByLabel('Title').fill('Weather speaking slides');
  await editEditor.getByRole('button', { name: 'Save item' }).click();
  const renamedDetails = page.getByRole('region', {
    name: 'Weather speaking slides Library item details',
  });
  await expect(
    renamedDetails.getByRole('heading', {
      level: 2,
      name: 'Weather speaking slides',
    }),
  ).toBeVisible();

  await page.getByLabel('Search').fill('');
  await renamedDetails.getByRole('button', { name: 'Archive' }).click();
  await expect(renamedDetails.locator('[data-status="archived"]')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(renamedDetails.locator('[data-status="active"]')).toBeVisible();

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(renamedDetails.locator('[data-status="archived"]')).toBeVisible();

  await renamedDetails.getByRole('button', { name: 'Restore' }).click();
  await expect(renamedDetails.locator('[data-status="active"]')).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Weather speaking slides' }),
  ).toBeVisible();
});
