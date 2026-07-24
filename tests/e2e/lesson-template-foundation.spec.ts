import { expect, test, type Page } from '@playwright/test';

const timestamp = '2026-07-23T20:00:00.000Z';

const records = {
  schoolYears: [
    {
      id: 'phase-3e-4-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'phase-3e-4-context',
      kind: 'class',
      name: 'Synthetic template class',
      schoolYearId: 'phase-3e-4-year',
      status: 'active',
    },
  ],
  categoryValues: [
    {
      id: 'phase-3e-4-format',
      familyId: 'template-format',
      name: 'Workshop',
      normalizedName: 'workshop',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  libraryItems: [
    {
      id: 'phase-3e-4-resource',
      catalogType: 'resource',
      title: 'Fraction model cards',
      tags: ['Math'],
      typedFields: {
        catalogType: 'resource',
        sourceLocation: 'Binder A',
        usageNotes: 'One set per pair.',
      },
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
};

async function seed(page: Page): Promise<void> {
  await page.evaluate(async (values: typeof records) => {
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

async function readStore(page: Page, storeName: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const transaction = database.transaction([name], 'readonly');
        const request = transaction.objectStore(name).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
      });
    } finally {
      database.close();
    }
  }, storeName);
}

test('Lesson Templates remain independent sources and apply reusable Plan structure undoably', async ({
  page,
}) => {
  await page.goto('./#/templates');
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 7,
    );
  });
  await seed(page);
  await page.reload();

  await page.getByRole('button', { name: 'New template' }).click();
  const editor = page.getByRole('form', { name: 'Lesson template editor' });
  await editor.getByLabel('Template title').fill('Workshop comparison structure');
  await editor.getByLabel('Suggested plan title').fill('Unit fraction comparison');
  await editor.getByLabel('Subject').fill('Math');
  await editor.getByLabel('Duration in minutes').fill('45');
  await editor.getByLabel('Workshop').check();

  const lessonLibrary = editor.getByRole('region', { name: 'Lesson Library' });
  await lessonLibrary.getByText('Add from Library').click();
  await lessonLibrary.getByLabel('Type').selectOption('resource');
  await lessonLibrary.getByRole('button', { name: 'Attach' }).click();

  await editor.getByRole('button', { name: 'Add step' }).click();
  await editor.getByLabel('Step title').fill('Compare fraction models');
  await editor.getByLabel('Phase').selectOption('guided-practice');
  await editor.getByLabel('Student activity and directions').fill('Partners compare two models.');
  await editor.getByRole('button', { name: 'Create template' }).click();

  const details = page.getByRole('article', {
    name: 'Workshop comparison structure lesson template details',
  });
  await expect(details).toBeVisible();
  await expect(details.getByText('Workshop', { exact: true })).toBeVisible();
  await expect(details.getByText('Fraction model cards')).toBeVisible();

  await details.getByRole('button', { name: 'Archive' }).click();
  await expect(details.locator('[data-status="archived"]')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(details.locator('[data-status="active"]')).toBeVisible();

  await page.goto('./#/planning/edit?context=phase-3e-4-context&date=2026-07-23&return=learners');
  const templatePanel = page.getByRole('region', { name: 'Apply lesson template' });
  await expect(templatePanel.getByLabel('Template')).toHaveValue(
    (await readStore(page, 'lessonTemplates'))[0]?.id as string,
  );
  await templatePanel.getByRole('button', { name: 'Apply to draft' }).click();

  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Unit fraction comparison',
  );
  await expect(page.getByLabel('Subject')).toHaveValue('Math');
  await expect(page.getByLabel('Duration in minutes')).toHaveValue('45');
  await expect(page.getByLabel('Step title')).toHaveValue('Compare fraction models');
  await expect(templatePanel.getByText(/Applied from Workshop comparison structure/)).toBeVisible();

  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();

  const [templates, plans] = await Promise.all([
    readStore(page, 'lessonTemplates'),
    readStore(page, 'lessonPlans'),
  ]);
  expect(templates).toHaveLength(1);
  expect(plans).toHaveLength(1);
  expect(plans[0]).toMatchObject({
    title: 'Unit fraction comparison',
    templateApplication: {
      templateId: templates[0]?.id,
      templateTitle: 'Workshop comparison structure',
    },
    libraryLinks: [
      {
        libraryItemId: 'phase-3e-4-resource',
        catalogType: 'resource',
      },
    ],
  });
  const templateStepId = (templates[0] as { lessonFlow?: Array<{ id?: string }> }).lessonFlow?.[0]
    ?.id;
  const planStepId = (plans[0] as { lessonFlow?: Array<{ id?: string }> }).lessonFlow?.[0]?.id;
  expect(planStepId).toBeTruthy();
  expect(planStepId).not.toBe(templateStepId);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => readStore(page, 'lessonPlans')).toHaveLength(0);
  await expect.poll(() => readStore(page, 'lessonTemplates')).toHaveLength(1);

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => readStore(page, 'lessonPlans')).toHaveLength(1);
});
