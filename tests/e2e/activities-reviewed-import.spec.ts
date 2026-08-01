import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function waitForSchema(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const databases = await page.evaluate(() => indexedDB.databases());
      return databases.some(
        (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 13,
      );
    })
    .toBe(true);
}

async function readImportedActivityState(page: Page, title: string) {
  return page.evaluate(async (expectedTitle) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const transaction = database.transaction(
        ['libraryItems', 'categoryValues', 'categoryAssignments', 'importRuns'],
        'readonly',
      );
      const all = <T>(store: string) =>
        new Promise<T[]>((resolve, reject) => {
          const request = transaction.objectStore(store).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result as T[]);
        });
      const [items, values, assignments, runs] = await Promise.all([
        all<Record<string, unknown>>('libraryItems'),
        all<Record<string, unknown>>('categoryValues'),
        all<Record<string, unknown>>('categoryAssignments'),
        all<Record<string, unknown>>('importRuns'),
      ]);
      const item = items.find(
        (candidate) => candidate.catalogType === 'activity' && candidate.title === expectedTitle,
      );
      const purpose = values.find(
        (candidate) =>
          candidate.familyId === 'purpose-tag' && candidate.normalizedName === 'oral rehearsal',
      );
      return {
        item,
        purpose,
        assignment: assignments.find(
          (candidate) =>
            candidate.entityId === item?.id && candidate.categoryValueId === purpose?.id,
        ),
        activityRuns: runs.filter((run) => run.importType === 'activities').length,
      };
    } finally {
      database.close();
    }
  }, title);
}

async function seedActivity(page: Page, values: Record<string, unknown>): Promise<void> {
  await waitForSchema(page);
  await page.evaluate(async (record) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('libraryItems', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('libraryItems').put(record);
      });
    } finally {
      database.close();
    }
  }, values);
}

test('Activities import offers formal Excel and CSV templates from the canonical workspace', async ({
  page,
}) => {
  await page.goto('./#/import?type=activities');
  await waitForSchema(page);
  await expect(page.getByRole('heading', { name: 'Import Activities' })).toBeVisible();

  const xlsxDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel template' }).click();
  expect((await xlsxDownloadPromise).suggestedFilename()).toBe(
    'Classroom-Activities-Import-Template.xlsx',
  );

  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV template' }).click();
  expect((await csvDownloadPromise).suggestedFilename()).toBe(
    'Classroom-Activities-Import-Template.csv',
  );
});

test('Activities paste-table preview is no-write, creates controlled values atomically, and globally undoes', async ({
  page,
}) => {
  const title = 'Imported Partner Retell 3I';
  await page.goto('./#/import?type=activities');
  await waitForSchema(page);
  await expect(page.getByRole('heading', { name: 'Import Activities' })).toBeVisible();

  await page.getByLabel('Pasted table').check();
  await page
    .getByLabel('Paste a table with one header row')
    .fill(
      [
        'activity_id\ttitle\tpurpose\tduration_minutes\tgrouping\tmaterials\tsteps\ttags',
        `ACT-3I-101\t${title}\tOral rehearsal\t15\tpartners\tPicture cards; timer\tPartners retell events in order.\tSpeaking`,
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByLabel('Default external source namespace').fill('Synthetic District Catalog');
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  await expect(
    page.getByRole('heading', { name: 'Review every classified Activity row' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Activity import preview summary').getByText('Review', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => readImportedActivityState(page, title))
    .toMatchObject({
      item: undefined,
      activityRuns: 0,
    });

  await page
    .getByLabel('Purpose: Oral rehearsal')
    .selectOption({ label: 'Create reviewed controlled value' });
  await page.getByRole('button', { name: 'Apply decisions and regenerate preview' }).click();
  await expect(
    page.getByLabel('Activity import preview summary').getByText('Create', { exact: true }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByLabel(/Commit records, status, tags/).check();
  await page.getByRole('button', { name: 'Commit reviewed Activities' }).click();
  await expect(page.getByText(/Committed 1 new and 0 updated Activities/)).toBeVisible();
  await expect
    .poll(() => readImportedActivityState(page, title))
    .toMatchObject({
      item: {
        title,
        externalSource: 'Synthetic District Catalog',
        externalKey: 'ACT-3I-101',
        typedFields: {
          catalogType: 'activity',
          grouping: 'partners',
          estimatedMinutes: 15,
          materials: 'Picture cards; timer',
          directions: 'Partners retell events in order.',
        },
      },
      purpose: { name: 'Oral rehearsal', lifecycleState: 'active' },
      assignment: { familyId: 'purpose-tag' },
      activityRuns: 1,
    });

  await page.getByRole('link', { name: 'Open Library Activities' }).click();
  await page.getByRole('button', { name: 'Activities' }).click();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByText('Picture cards; timer')).toBeVisible();
  await expect(page.getByText('Oral rehearsal')).toBeVisible();
  await expect(page.getByText('Synthetic District Catalog')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(() => readImportedActivityState(page, title))
    .toMatchObject({
      item: undefined,
      purpose: undefined,
      assignment: undefined,
      activityRuns: 0,
    });

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect
    .poll(() => readImportedActivityState(page, title))
    .toMatchObject({
      item: { title },
      purpose: { name: 'Oral rehearsal' },
      assignment: { familyId: 'purpose-tag' },
      activityRuns: 1,
    });
});

test('Activity title equality requires review while exact external identity can update', async ({
  page,
}) => {
  const createdAt = '2026-07-31T12:00:00.000Z';
  await page.goto('./#/import?type=activities');
  await seedActivity(page, {
    id: 'existing-title-only-activity',
    catalogType: 'activity',
    title: 'Title Review Activity 3I',
    tags: [],
    typedFields: { catalogType: 'activity', grouping: 'flexible' },
    status: 'active',
    createdAt,
    updatedAt: createdAt,
  });
  await seedActivity(page, {
    id: 'existing-stable-activity',
    catalogType: 'activity',
    title: 'Stable Identity Activity 3I',
    tags: [],
    typedFields: { catalogType: 'activity', grouping: 'individual', materials: 'Old cards' },
    externalSource: 'synthetic catalog',
    externalKey: 'ACT-UPDATE-1',
    importIdentityKey: 'activity\u0000synthetic catalog\u0000act-update-1',
    status: 'active',
    createdAt,
    updatedAt: createdAt,
  });
  await page.reload();

  await page.getByLabel('Choose CSV, XLSX, or JSON Activities file').setInputFiles({
    name: 'activity-title-review.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('title,materials\nTitle Review Activity 3I,New cards\n'),
  });
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await expect(
    page
      .getByLabel('Scrollable Activities import preview')
      .getByText(/Title equality is only a probable duplicate/),
  ).toBeVisible();
  await expect(
    page.getByLabel('Activity import preview summary').getByText('Review', { exact: true }),
  ).toBeVisible();

  await page.reload();
  await page.getByLabel('Choose CSV, XLSX, or JSON Activities file').setInputFiles({
    name: 'activity-stable-update.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'activity_id,title,materials\nACT-UPDATE-1,Stable Identity Activity 3I,New cards\n',
    ),
  });
  await page.getByLabel('Default external source namespace').fill('Synthetic Catalog');
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await expect(
    page.getByLabel('Activity import preview summary').getByText('Update', { exact: true }),
  ).toBeVisible();
  await page.getByLabel(/I reviewed and approve the 1 Activity updates/).check();
  await page.getByLabel(/Commit records, status, tags/).check();
  await page.getByRole('button', { name: 'Commit reviewed Activities' }).click();
  await expect(page.getByText(/Committed 0 new and 1 updated Activities/)).toBeVisible();
});

test('Activities import remains contained, keyboard reachable, and axe-clean on a compact viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/import?type=activities');
  await waitForSchema(page);
  await page.getByLabel('Pasted table').focus();
  await expect(page.getByLabel('Pasted table')).toBeFocused();
  await page.getByLabel('Pasted table').check();
  await page
    .getByLabel('Paste a table with one header row')
    .fill('title\tduration_minutes\tgrouping\nCompact Activity 3I\t10\tindividual\n');
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const scroller = page.getByLabel('Scrollable Activities import preview');
  await scroller.focus();
  await expect(scroller).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
