import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seedLibraryClassifications(page: Page): Promise<void> {
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

        const values = [
          {
            id: 'subject-mathematics',
            familyId: 'subject',
            name: 'Mathematics',
            normalizedName: 'mathematics',
            aliases: ['Math'],
            normalizedAliases: ['math'],
          },
          {
            id: 'subject-history',
            familyId: 'subject',
            name: 'History',
            normalizedName: 'history',
            aliases: [],
            normalizedAliases: [],
          },
          {
            id: 'grade-3',
            familyId: 'grade-level',
            name: 'Grade 3',
            normalizedName: 'grade 3',
            aliases: [],
            normalizedAliases: [],
          },
          {
            id: 'language-chinese',
            familyId: 'language',
            name: 'Chinese',
            normalizedName: 'chinese',
            aliases: [],
            normalizedAliases: [],
          },
          {
            id: 'language-level-4',
            familyId: 'language-level',
            name: 'Level 4',
            normalizedName: 'level 4',
            aliases: ['L4'],
            normalizedAliases: ['l4'],
          },
          {
            id: 'activity-role-play',
            familyId: 'activity-type',
            name: 'Role-play',
            normalizedName: 'role-play',
            aliases: [],
            normalizedAliases: [],
          },
          {
            id: 'format-slide-deck',
            familyId: 'resource-format',
            name: 'Slide deck',
            normalizedName: 'slide deck',
            aliases: [],
            normalizedAliases: [],
          },
          {
            id: 'purpose-practice',
            familyId: 'purpose-tag',
            name: 'Practice',
            normalizedName: 'practice',
            aliases: [],
            normalizedAliases: [],
          },
          {
            id: 'focus-speaking',
            familyId: 'focus-tag',
            name: 'Speaking',
            normalizedName: 'speaking',
            aliases: [],
            normalizedAliases: [],
          },
        ];
        for (const [sortOrder, value] of values.entries()) {
          transaction.objectStore('categoryValues').put({
            ...value,
            sortOrder,
            isDefault: false,
            lifecycleState: 'active',
            createdAt: '2026-07-23T12:00:00.000Z',
            updatedAt: '2026-07-23T12:00:00.000Z',
          });
        }
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
  await seedLibraryClassifications(page);
  await page.reload();

  await page.getByRole('button', { name: 'New Library item' }).click();
  const editor = page.getByRole('form', {
    name: 'Library catalog editor',
  });
  await editor.getByLabel('Catalog type').selectOption('resource');
  await editor.getByLabel('Title').fill('Weather vocabulary slides');
  await editor.getByLabel('Description').fill('Reusable picture prompts for oral language.');
  await editor.getByLabel('Tags').fill('Speaking, Weather');
  await editor.getByLabel('Mathematics').check();
  await editor.getByLabel('Grade 3').check();
  await editor.getByLabel('Chinese').check();
  await editor.getByLabel('Level 4').check();
  await editor.getByLabel('Slide deck').check();
  await editor.getByLabel('Practice').check();
  await editor.getByLabel('Speaking', { exact: true }).check();
  await editor.getByRole('button', { name: 'Create item' }).click();

  const details = page.getByRole('region', {
    name: 'Weather vocabulary slides Library item details',
  });
  await expect(details).toBeVisible();
  const classificationDefinitions = details.getByRole('definition');
  for (const label of [
    'Mathematics',
    'Grade 3',
    'Chinese',
    'Level 4',
    'Slide deck',
    'Practice',
    'Speaking',
  ]) {
    await expect(classificationDefinitions.getByText(label, { exact: true })).toBeVisible();
  }

  await page
    .getByLabel('Library catalog types')
    .getByRole('button', { name: 'Resources', exact: true })
    .click();
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

async function archiveCategoryValue(page: Page, valueId: string): Promise<void> {
  await page.evaluate(async (id) => {
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
        const request = store.get(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          store.put({
            ...(request.result as Record<string, unknown>),
            lifecycleState: 'archived',
            archivedAt: '2026-07-23T13:00:00.000Z',
            updatedAt: '2026-07-23T13:00:00.000Z',
          });
        };
      });
    } finally {
      database.close();
    }
  }, valueId);
}

test('Assessments use the shared Library classification foundation and preserve archived assignments', async ({
  page,
}) => {
  await page.goto('./#/library?tab=assessments');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 13,
    );
  });
  await seedLibraryClassifications(page);
  await page.reload();

  await page.getByRole('button', { name: 'New Library item' }).click();
  const editor = page.getByRole('form', { name: 'Library catalog editor' });
  await editor.getByLabel('Catalog type').selectOption('assessment');
  await editor.getByLabel('Title').fill('Picture retell assessment');
  await editor.getByLabel('Student prompt').fill('Retell the picture sequence.');
  await editor.getByLabel('Evidence to collect').fill('Sequence language and complete sentences.');
  await editor.getByLabel('Mathematics').check();
  await editor.getByLabel('Grade 3').check();
  await editor.getByLabel('Chinese').check();
  await editor.getByLabel('Level 4').check();
  await editor.getByLabel('Practice').check();
  await editor.getByLabel('Speaking', { exact: true }).check();
  await editor.getByRole('button', { name: 'Create item' }).click();

  const details = page.getByRole('region', {
    name: 'Picture retell assessment Library item details',
  });
  const assessmentClassificationDefinitions = details.getByRole('definition');
  for (const label of ['Mathematics', 'Grade 3', 'Chinese', 'Level 4', 'Practice', 'Speaking']) {
    await expect(
      assessmentClassificationDefinitions.getByText(label, { exact: true }),
    ).toBeVisible();
  }

  await archiveCategoryValue(page, 'subject-mathematics');
  await archiveCategoryValue(page, 'subject-history');
  await page.reload();
  const refreshedDetails = page.getByRole('region', {
    name: 'Picture retell assessment Library item details',
  });
  await expect(refreshedDetails.getByText('Mathematics (Archived)', { exact: true })).toBeVisible();

  await refreshedDetails.getByRole('button', { name: 'Edit' }).click();
  const editEditor = page.getByRole('form', { name: 'Library catalog editor' });
  const assignedArchivedSubject = editEditor.getByRole('checkbox', {
    name: /Mathematics.*Archived/,
  });
  await expect(assignedArchivedSubject).toBeChecked();
  await expect(assignedArchivedSubject).toBeEnabled();

  const unassignedArchivedSubject = editEditor.getByRole('checkbox', {
    name: /History.*Archived/,
  });
  await expect(unassignedArchivedSubject).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
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
