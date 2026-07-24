import { expect, test, type Page } from '@playwright/test';

const records = {
  schoolYears: [
    {
      id: 'phase-3e-3-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'phase-3e-3-context',
      kind: 'class',
      name: 'Synthetic Library class',
      schoolYearId: 'phase-3e-3-year',
      status: 'active',
    },
  ],
  libraryItems: [
    {
      id: 'phase-3e-3-resource',
      catalogType: 'resource',
      title: 'Fraction model cards',
      description: 'Reusable visual fraction models.',
      tags: ['Math'],
      typedFields: {
        catalogType: 'resource',
        sourceLocation: 'Binder A',
        usageNotes: 'Print one set per pair.',
      },
      status: 'active',
      createdAt: '2026-07-23T12:00:00.000Z',
      updatedAt: '2026-07-23T12:00:00.000Z',
    },
    {
      id: 'phase-3e-3-assessment',
      catalogType: 'assessment',
      title: 'Unit fraction exit check',
      description: 'One-item formative check.',
      tags: ['Math'],
      typedFields: {
        catalogType: 'assessment',
        assessmentKind: 'formative',
        studentPrompt: 'Compare two unit fractions and explain.',
        evidenceToCollect: 'A labeled model and one sentence.',
      },
      status: 'active',
      createdAt: '2026-07-23T12:00:00.000Z',
      updatedAt: '2026-07-23T12:00:00.000Z',
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

async function readPlans(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const transaction = database.transaction(['lessonPlans'], 'readonly');
        const request = transaction.objectStore('lessonPlans').getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
      });
    } finally {
      database.close();
    }
  });
}

test('Planning applies live Library links and explicit step snapshots transactionally', async ({
  page,
}) => {
  await page.goto('./#/learners?date=2026-07-23');
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 6,
    );
  });
  await seed(page);
  await page.reload();

  const planning = page.getByRole('region', {
    name: 'Planning for Synthetic Library class',
  });
  await planning.getByRole('link', { name: 'New plan' }).click();
  await page.getByLabel('Title').fill('Unit fraction comparison');

  const lessonLibrary = page.getByRole('region', { name: 'Lesson Library' });
  await lessonLibrary.getByText('Add from Library').click();
  await expect(lessonLibrary.getByLabel('Type')).toHaveValue('resource');
  await lessonLibrary.getByRole('button', { name: 'Attach' }).click();
  await expect(lessonLibrary.getByText('Fraction model cards')).toBeVisible();
  await expect(lessonLibrary.getByText(/Live source/)).toBeVisible();
  await expect(lessonLibrary.getByText('Print one set per pair.')).toBeVisible();

  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step title').fill('Collect evidence');
  await page.getByLabel('Phase').selectOption('assessment');

  const stepLibrary = page.getByRole('region', { name: 'Step 1 Library' });
  await stepLibrary.getByText('Add from Library').click();
  await expect(stepLibrary.getByLabel('Type')).toHaveValue('assessment');
  await stepLibrary.getByText(/Freeze the current version/).click();
  await stepLibrary.getByRole('button', { name: 'Attach' }).click();
  await expect(stepLibrary.getByText('Unit fraction exit check')).toBeVisible();
  await expect(stepLibrary.getByText(/Frozen snapshot/)).toBeVisible();
  await expect(stepLibrary.getByText('Compare two unit fractions and explain.')).toBeVisible();

  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();

  let plans = await readPlans(page);
  expect(plans).toHaveLength(1);
  expect(plans[0]).toMatchObject({
    title: 'Unit fraction comparison',
    libraryLinks: [
      {
        libraryItemId: 'phase-3e-3-resource',
        catalogType: 'resource',
      },
    ],
    lessonFlow: [
      {
        title: 'Collect evidence',
        phase: 'assessment',
        libraryLinks: [
          {
            libraryItemId: 'phase-3e-3-assessment',
            catalogType: 'assessment',
            snapshot: { title: 'Unit fraction exit check' },
          },
        ],
      },
    ],
  });
  expect(JSON.stringify((plans[0] as { libraryLinks?: unknown }).libraryLinks)).not.toContain(
    'Fraction model cards',
  );

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => readPlans(page)).toHaveLength(0);

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => readPlans(page)).toHaveLength(1);
  plans = await readPlans(page);
  expect(plans[0]).toMatchObject({ title: 'Unit fraction comparison' });
});
