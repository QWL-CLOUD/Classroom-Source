import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function waitForSchema(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const databases = await page.evaluate(() => indexedDB.databases());
      return databases.some(
        (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 14,
      );
    })
    .toBe(true);
}

async function seedEnglishLanguageArts(page: Page): Promise<void> {
  await waitForSchema(page);
  await page.evaluate(async () => {
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
        transaction.objectStore('categoryValues').put({
          id: 'mapping-import-subject-ela',
          familyId: 'subject',
          name: 'English Language Arts',
          normalizedName: 'english language arts',
          aliases: [],
          normalizedAliases: [],
          sortOrder: 0,
          isDefault: false,
          lifecycleState: 'active',
          createdAt: '2026-08-04T12:00:00.000Z',
          updatedAt: '2026-08-04T12:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  });
}

async function seedInactiveElaMapping(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('classificationMappingPresets', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('classificationMappingPresets').put({
          id: 'mapping-import-ela',
          familyId: 'subject',
          sourceText: 'ELA',
          normalizedSourceText: 'ela',
          targetCategoryValueId: 'mapping-import-subject-ela',
          status: 'inactive',
          createdAt: '2026-08-04T12:00:00.000Z',
          updatedAt: '2026-08-04T12:00:00.000Z',
          deactivatedAt: '2026-08-04T12:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  });
}

async function readMappingImportState(page: Page, activityTitle: string, resourceTitle?: string) {
  return page.evaluate(
    async ({ expectedActivityTitle, expectedResourceTitle }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('classroom-v20');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        const transaction = database.transaction(
          ['classificationMappingPresets', 'libraryItems', 'categoryAssignments', 'importRuns'],
          'readonly',
        );
        const all = <T>(storeName: string) =>
          new Promise<T[]>((resolve, reject) => {
            const request = transaction.objectStore(storeName).getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result as T[]);
          });
        const [mappings, items, assignments, runs] = await Promise.all([
          all<Record<string, unknown>>('classificationMappingPresets'),
          all<Record<string, unknown>>('libraryItems'),
          all<Record<string, unknown>>('categoryAssignments'),
          all<Record<string, unknown>>('importRuns'),
        ]);
        const activity = items.find(
          (item) => item.catalogType === 'activity' && item.title === expectedActivityTitle,
        );
        const resource = items.find(
          (item) => item.catalogType === 'resource' && item.title === expectedResourceTitle,
        );
        const assignmentFor = (item: Record<string, unknown> | undefined) =>
          assignments.find(
            (assignment) =>
              assignment.entityId === item?.id &&
              assignment.categoryValueId === 'mapping-import-subject-ela',
          );
        return {
          mappings,
          activity,
          activityAssignment: assignmentFor(activity),
          resource,
          resourceAssignment: assignmentFor(resource),
          activityRuns: runs.filter((run) => run.importType === 'activities').length,
          resourceRuns: runs.filter((run) => run.importType === 'resources').length,
        };
      } finally {
        database.close();
      }
    },
    { expectedActivityTitle: activityTitle, expectedResourceTitle: resourceTitle },
  );
}

async function prepareActivitySubjectReview(page: Page, title: string): Promise<void> {
  await page.getByLabel('Pasted table').check();
  await page
    .getByLabel('Paste a table with one header row')
    .fill(['activity_id\ttitle\tsubject', `MAP-ACT-1\t${title}\tELA`].join('\n'));
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByLabel('Default external source namespace').fill('Mapping Demo Catalog');
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
}

test('saved import mapping commits atomically, globally undoes, and is reused across catalogs', async ({
  page,
}) => {
  const activityTitle = 'Mapped Discussion Activity';
  const resourceTitle = 'Mapped Discussion Resource';

  await page.goto('./#/import?type=activities');
  await seedEnglishLanguageArts(page);
  await page.reload();
  await prepareActivitySubjectReview(page, activityTitle);

  await page
    .getByLabel('Subject resolution for ELA')
    .selectOption({ label: 'Use existing “English Language Arts”' });
  await page
    .getByLabel('Subject mapping behavior for ELA')
    .selectOption({ label: 'Save as import mapping' });
  await page.getByRole('button', { name: 'Apply decisions and regenerate preview' }).click();

  await expect
    .poll(() => readMappingImportState(page, activityTitle))
    .toMatchObject({ mappings: [], activity: undefined, activityRuns: 0 });

  await page.getByLabel(/Commit records, status, tags/).check();
  await page.getByRole('button', { name: 'Commit reviewed Activities' }).click();
  await expect(page.getByText(/Saved 1 and updated 0 import mappings/)).toBeVisible();
  await expect
    .poll(() => readMappingImportState(page, activityTitle))
    .toMatchObject({
      mappings: [
        {
          familyId: 'subject',
          sourceText: 'ELA',
          normalizedSourceText: 'ela',
          targetCategoryValueId: 'mapping-import-subject-ela',
          status: 'active',
        },
      ],
      activity: { title: activityTitle },
      activityAssignment: { familyId: 'subject' },
      activityRuns: 1,
    });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(() => readMappingImportState(page, activityTitle))
    .toMatchObject({ mappings: [], activity: undefined, activityRuns: 0 });
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect
    .poll(() => readMappingImportState(page, activityTitle))
    .toMatchObject({
      mappings: [expect.objectContaining({ sourceText: 'ELA', status: 'active' })],
      activity: { title: activityTitle },
      activityRuns: 1,
    });

  await page.goto('./#/import?type=resources');
  await page.getByRole('radio', { name: /Pasted table/ }).check();
  await page
    .getByLabel('Paste a table with one header row')
    .fill(
      [
        'resource_id\ttitle\tsubject\tsource_location',
        `MAP-RES-1\t${resourceTitle}\tELA\tShared Drive / Mapping Demo`,
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByLabel('Default external source namespace').fill('Mapping Demo Catalog');
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await expect(
    page.getByText('Saved import mapping: “ELA” → “English Language Arts”.'),
  ).toBeVisible();
  await expect(page.getByLabel('Subject resolution for ELA')).toHaveCount(0);
  await page.getByLabel(/Commit Resources, status, tags/).check();
  await page.getByRole('button', { name: 'Commit reviewed Resources' }).click();
  await expect
    .poll(() => readMappingImportState(page, activityTitle, resourceTitle))
    .toMatchObject({
      resource: { title: resourceTitle },
      resourceAssignment: { familyId: 'subject' },
      resourceRuns: 1,
    });

  await page.goto('./#/import?type=assessments');
  await page.getByLabel('Pasted table').check();
  await page
    .getByLabel('Paste Assessment rows with one header row')
    .fill(
      ['Title\tAssessment Kind\tSubject', 'Mapped Discussion Assessment\tFormative\tELA'].join(
        '\n',
      ),
    );
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await expect(
    page.getByText('Saved import mapping: “ELA” → “English Language Arts”.'),
  ).toBeVisible();
  await expect(page.getByLabel('Subject resolution for ELA')).toHaveCount(0);
});

test('an inactive mapping can be updated and reactivated in the same undoable import', async ({
  page,
}) => {
  const resourceTitle = 'Reactivated Mapping Resource';
  await page.goto('./#/import?type=resources');
  await seedEnglishLanguageArts(page);
  await seedInactiveElaMapping(page);
  await page.reload();

  await page.getByRole('radio', { name: /Pasted table/ }).check();
  await page
    .getByLabel('Paste a table with one header row')
    .fill(
      [
        'resource_id\ttitle\tsubject\tsource_location',
        `MAP-RES-UPDATE\t${resourceTitle}\tELA\tShared Drive / Mapping Update`,
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Review pasted table' }).click();

  await page.getByLabel('Default external source namespace').fill('Mapping Update Catalog');
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await expect(page.getByText('A saved import mapping exists, but it is inactive.')).toBeVisible();
  await page
    .getByLabel('Subject resolution for ELA')
    .selectOption({ label: 'Use existing “English Language Arts”' });
  await page
    .getByLabel('Subject mapping behavior for ELA')
    .selectOption({ label: 'Update and activate saved mapping' });
  await page.getByRole('button', { name: 'Apply decisions and regenerate preview' }).click();
  await page.getByLabel(/Commit Resources, status, tags/).check();
  await page.getByRole('button', { name: 'Commit reviewed Resources' }).click();
  await expect(page.getByText(/Saved 0 and updated 1 import mappings/)).toBeVisible();
  await expect
    .poll(() => readMappingImportState(page, 'unused', resourceTitle))
    .toMatchObject({
      mappings: [expect.objectContaining({ id: 'mapping-import-ela', status: 'active' })],
      resource: { title: resourceTitle },
      resourceAssignment: { familyId: 'subject' },
    });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(() => readMappingImportState(page, 'unused', resourceTitle))
    .toMatchObject({
      mappings: [expect.objectContaining({ id: 'mapping-import-ela', status: 'inactive' })],
      resource: undefined,
      resourceRuns: 0,
    });
});

test('Apply once leaves no mapping and the compact review stays keyboard reachable and axe-clean', async ({
  page,
}) => {
  const title = 'Apply Once Activity';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/import?type=activities');
  await seedEnglishLanguageArts(page);
  await page.reload();
  await prepareActivitySubjectReview(page, title);

  const resolution = page.getByLabel('Subject resolution for ELA');
  await resolution.focus();
  await expect(resolution).toBeFocused();
  await resolution.selectOption({ label: 'Use existing “English Language Arts”' });
  const behavior = page.getByLabel('Subject mapping behavior for ELA');
  await expect(behavior).toHaveValue('');
  await expect(behavior.getByRole('option', { name: 'Apply once' })).toBeAttached();
  await page.getByRole('button', { name: 'Apply decisions and regenerate preview' }).click();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations,
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);

  await page.getByLabel(/Commit records, status, tags/).check();
  await page.getByRole('button', { name: 'Commit reviewed Activities' }).click();
  await expect
    .poll(() => readMappingImportState(page, title))
    .toMatchObject({
      mappings: [],
      activity: { title },
      activityAssignment: { familyId: 'subject' },
      activityRuns: 1,
    });
});
