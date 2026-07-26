import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const xlsxFixtureBase64 =
  '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';

async function waitForSchema(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 9,
    );
  });
}

async function readImportCounts(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const transaction = database.transaction(['standards', 'standardImportBatches'], 'readonly');
      const count = (store: string) =>
        new Promise<number>((resolve, reject) => {
          const request = transaction.objectStore(store).count();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
      return { standards: await count('standards'), batches: await count('standardImportBatches') };
    } finally {
      database.close();
    }
  });
}

async function seedExistingStandard(page: Page): Promise<void> {
  await waitForSchema(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('standards', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('standards').put({
          id: 'existing-import-standard',
          issuingOrganization: 'Synthetic Standards Office',
          frameworkTitle: 'Synthetic Mathematics Standards',
          jurisdiction: 'Synthetic scope',
          version: '2026',
          frameworkKey:
            'synthetic standards office|synthetic mathematics standards|synthetic scope|2026',
          code: '3.NF.A.1',
          normalizedCode: '3.nf.a.1',
          statement: 'Old fraction statement.',
          sortOrder: 0,
          status: 'active',
          createdAt: '2026-07-25T12:00:00.000Z',
          updatedAt: '2026-07-25T12:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  });
}

async function fillSource(page: Page): Promise<void> {
  const sourceSection = page.getByRole('region', { name: 'Record source attribution' });
  await sourceSection.getByLabel(/Source name/).fill('Reviewed Mathematics Framework');
  await sourceSection.getByLabel(/Issuing organization/).fill('Synthetic Standards Office');
  await sourceSection.getByLabel(/Framework title/).fill('Synthetic Mathematics Standards');
  await sourceSection.getByLabel(/Jurisdiction or scope/).fill('Synthetic scope');
  await sourceSection.getByLabel(/Version or year/).fill('2026');
  await sourceSection.getByLabel(/Source note/).fill('Reviewed locally for import.');
}

test('Standards CSV import previews without writes, commits atomically, and globally undoes', async ({
  page,
}) => {
  await page.goto('./#/import');
  await seedExistingStandard(page);
  await page.reload();
  await page.getByLabel('Choose file').setInputFiles({
    name: 'reviewed-standards.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Code,Statement,Subject,Grade\n3.NF.A.1,Understand a fraction as a quantity.,Mathematics,3\n3.NF.A.2,Represent fractions on a number line.,Mathematics,3\n',
    ),
  });
  await fillSource(page);

  await expect(page.getByLabel(/Standard code/)).toHaveValue('0');
  await expect(page.getByLabel(/Standard statement/)).toHaveValue('1');
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  await expect(page.getByRole('heading', { name: 'Review every classified row' })).toBeVisible();
  await expect(page.getByText('Valid new Standard')).toHaveCount(1);
  await expect(page.getByText('Reviewed update')).toHaveCount(1);
  await expect.poll(() => readImportCounts(page)).toEqual({ standards: 1, batches: 0 });

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByLabel(/I reviewed and approve the 1 existing Standard updates/).check();
  await page.getByLabel(/Commit this complete preview/).check();
  await page.getByRole('button', { name: 'Commit reviewed import' }).click();
  await expect(page.getByText(/Committed 1 new and 1 updated Standards/)).toBeVisible();
  await expect.poll(() => readImportCounts(page)).toEqual({ standards: 2, batches: 1 });

  await page.reload();
  await expect.poll(() => readImportCounts(page)).toEqual({ standards: 2, batches: 1 });
  await page.goto('./#/standards');
  await page.getByRole('button', { name: /3\.NF\.A\.1/ }).click();
  await expect(page.getByText('Reviewed Mathematics Framework', { exact: true })).toBeVisible();
  await expect(page.getByText('Reviewed locally for import.')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => readImportCounts(page)).toEqual({ standards: 1, batches: 0 });
  await expect(page.getByText('Old fraction statement.')).toBeVisible();
});

test('Standards XLSX import requires worksheet selection and preserves local preview-only behavior', async ({
  page,
}) => {
  await page.goto('./#/import');
  await waitForSchema(page);
  await page.getByLabel('Choose file').setInputFiles({
    name: 'reviewed-standards.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(xlsxFixtureBase64, 'base64'),
  });

  await expect(page.getByLabel('Worksheet', { exact: true })).toHaveValue('0');
  await page.getByLabel('Worksheet', { exact: true }).selectOption({ label: 'Standards' });
  await fillSource(page);
  await expect(page.getByLabel(/Parent code/)).toHaveValue('4');
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  await expect(page.getByText('Valid new Standard')).toHaveCount(2);
  const previewTable = page.getByLabel('Scrollable Standards import preview');
  const previewCodeCells = previewTable.locator('tbody td:nth-child(3) > strong');
  await expect(previewCodeCells.filter({ hasText: /^3\.NF\.A$/ })).toBeVisible();
  await expect(previewCodeCells.filter({ hasText: /^3\.NF\.A\.1$/ })).toBeVisible();
  await expect.poll(() => readImportCounts(page)).toEqual({ standards: 0, batches: 0 });
});

test('Standards import controls remain contained and keyboard reachable on a compact viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/import');
  await waitForSchema(page);
  await page.getByLabel('Choose file').setInputFiles({
    name: 'compact.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Code,Statement\nA.1,Explain a model.\n'),
  });
  await fillSource(page);
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const scroller = page.getByLabel('Scrollable Standards import preview');
  await scroller.focus();
  await expect(scroller).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
