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

async function readResourceState(page: Page, title: string) {
  return page.evaluate(async (expectedTitle) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const transaction = database.transaction(
        [
          'libraryItems',
          'categoryValues',
          'categoryAssignments',
          'classificationMappingPresets',
          'importRuns',
        ],
        'readonly',
      );
      const all = <T>(store: string) =>
        new Promise<T[]>((resolve, reject) => {
          const request = transaction.objectStore(store).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result as T[]);
        });
      const [items, values, assignments, mappings, runs] = await Promise.all([
        all<Record<string, unknown>>('libraryItems'),
        all<Record<string, unknown>>('categoryValues'),
        all<Record<string, unknown>>('categoryAssignments'),
        all<Record<string, unknown>>('classificationMappingPresets'),
        all<Record<string, unknown>>('importRuns'),
      ]);
      const item = items.find(
        (candidate) => candidate.catalogType === 'resource' && candidate.title === expectedTitle,
      );
      const format = values.find(
        (candidate) =>
          candidate.familyId === 'resource-format' &&
          assignments.some(
            (assignment) =>
              assignment.entityId === item?.id && assignment.categoryValueId === candidate.id,
          ),
      );
      return {
        item,
        format,
        assignment: assignments.find(
          (candidate) =>
            candidate.entityId === item?.id && candidate.categoryValueId === format?.id,
        ),
        mappingCount: mappings.length,
        resourceRuns: runs.filter((run) => run.importType === 'resources').length,
      };
    } finally {
      database.close();
    }
  }, title);
}

async function seedResource(page: Page, values: Record<string, unknown>): Promise<void> {
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

test('Resources import offers formal Excel and CSV templates from the canonical workspace', async ({
  page,
}) => {
  await page.goto('./#/import?type=resources');
  await waitForSchema(page);
  await expect(page.getByRole('heading', { name: 'Import Resources' })).toBeVisible();

  const xlsxDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel template' }).click();
  expect((await xlsxDownloadPromise).suggestedFilename()).toBe(
    'Classroom-Resources-Import-Template.xlsx',
  );

  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV template' }).click();
  expect((await csvDownloadPromise).suggestedFilename()).toBe(
    'Classroom-Resources-Import-Template.csv',
  );
});

test('Resources pasted-table preview is no-write, commits format atomically, and globally undoes', async ({
  page,
}) => {
  const title = 'Imported Weather Deck 3I';
  await page.goto('./#/import?type=resources');
  await waitForSchema(page);
  await page.getByRole('radio', { name: /Pasted table/ }).check();
  await page
    .getByLabel('Paste a table with one header row')
    .fill(
      [
        'resource_id\ttitle\tresource_format\tsource_location\tusage_notes\ttags',
        `RES-3I-101\t${title}\tSlides\tShared Drive / Synthetic / Weather.pptx\tUse in partners.\tWeather`,
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByLabel('Default external source namespace').fill('Synthetic Resource Catalog');
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  await expect
    .poll(() => readResourceState(page, title))
    .toMatchObject({
      item: undefined,
      mappingCount: 0,
      resourceRuns: 0,
    });
  await page
    .getByLabel('Resource Format resolution for Slides')
    .selectOption({ label: 'Create “Slides”' });
  await page.getByRole('button', { name: 'Apply decisions and regenerate preview' }).click();
  await page.getByLabel(/Commit Resources, status, tags/).check();
  await page.getByRole('button', { name: 'Commit reviewed Resources' }).click();
  await expect(page.getByText(/Committed 1 new and 0 updated Resources/)).toBeVisible();

  await expect
    .poll(() => readResourceState(page, title))
    .toMatchObject({
      item: {
        title,
        externalSource: 'Synthetic Resource Catalog',
        externalKey: 'RES-3I-101',
        typedFields: {
          catalogType: 'resource',
          sourceLocation: 'Shared Drive / Synthetic / Weather.pptx',
        },
      },
      format: { name: 'Slides' },
      assignment: { familyId: 'resource-format' },
      mappingCount: 0,
      resourceRuns: 1,
    });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(() => readResourceState(page, title))
    .toMatchObject({
      item: undefined,
      format: undefined,
      assignment: undefined,
      resourceRuns: 0,
    });
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect
    .poll(() => readResourceState(page, title))
    .toMatchObject({ item: { title }, resourceRuns: 1 });
});

test('Resources URL source remains local, requires reviewed format, and renders a safe Library link', async ({
  page,
}) => {
  const title = 'Fictional Museum Map 3I';
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) externalRequests.push(request.url());
  });

  await page.goto('./#/import?type=resources');
  await waitForSchema(page);
  await page.getByRole('radio', { name: /Add URL/ }).check();
  await page.getByLabel('Title *').fill(title);
  await page.getByLabel('URL *').fill('https://example.invalid/fictional-map');
  await page.getByLabel('Resource Format suggestion').fill('URL');
  await page.getByRole('button', { name: 'Prepare reviewed URL row' }).click();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  expect(externalRequests).toEqual([]);
  await page
    .getByLabel('Resource Format resolution for URL')
    .selectOption({ label: 'Create “URL”' });
  await page.getByRole('button', { name: 'Apply decisions and regenerate preview' }).click();
  await page.getByLabel(/Commit Resources, status, tags/).check();
  await page.getByRole('button', { name: 'Commit reviewed Resources' }).click();
  await page.getByRole('link', { name: 'Open Library Resources' }).click();
  await expect(page.getByRole('button', { name: 'Resources', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: new RegExp(title) }).click();
  const link = page.getByRole('link', { name: 'https://example.invalid/fictional-map' });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(externalRequests).toEqual([]);
});

test('Resources local-file flow stores metadata only and never file contents', async ({ page }) => {
  const title = 'Private Synthetic Deck';
  await page.goto('./#/import?type=resources');
  await waitForSchema(page);
  await page.getByRole('radio', { name: /Local file metadata/ }).check();
  await page.getByLabel('Location label').fill('Shared Drive / Synthetic');
  await page.getByLabel('Choose Resource files for metadata only').setInputFiles({
    name: `${title}.pptx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: Buffer.from('PRIVATE-CONTENT-MUST-NOT-BE-STORED'),
  });
  await page.getByRole('button', { name: 'Review file metadata rows' }).click();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await page
    .getByLabel('Resource Format resolution for Slides')
    .selectOption({ label: 'Create “Slides”' });
  await page.getByRole('button', { name: 'Apply decisions and regenerate preview' }).click();
  await page.getByLabel(/Commit Resources, status, tags/).check();
  await page.getByRole('button', { name: 'Commit reviewed Resources' }).click();
  const state = await readResourceState(page, title);
  expect(JSON.stringify(state)).not.toContain('PRIVATE-CONTENT-MUST-NOT-BE-STORED');
  expect(state.item).toMatchObject({
    typedFields: {
      sourceLocation: `Shared Drive / Synthetic / ${title}.pptx`,
      usageNotes: expect.stringContaining('File contents stored by Classroom: No'),
    },
  });
});

test('Resource title equality requires review while compact source and preview stay keyboard reachable and axe-clean', async ({
  page,
}) => {
  const createdAt = '2026-08-01T04:00:00.000Z';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/import?type=resources');
  await seedResource(page, {
    id: 'resource-title-only',
    catalogType: 'resource',
    title: 'Title Review Resource 3I',
    tags: [],
    typedFields: { catalogType: 'resource', sourceLocation: 'Binder A' },
    status: 'active',
    createdAt,
    updatedAt: createdAt,
  });
  await page.reload();
  await page.getByRole('radio', { name: /Pasted table/ }).focus();
  await expect(page.getByRole('radio', { name: /Pasted table/ })).toBeFocused();
  await page.getByRole('radio', { name: /Pasted table/ }).check();
  await page
    .getByLabel('Paste a table with one header row')
    .fill('title\tsource_location\nTitle Review Resource 3I\tBinder B\n');
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await expect(
    page.getByLabel('Scrollable Resources import preview').getByText(/probable duplicate/),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const scroller = page.getByLabel('Scrollable Resources import preview');
  await scroller.focus();
  await expect(scroller).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
