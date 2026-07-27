import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const timestamp = '2026-07-25T04:00:00.000Z';

async function seedLongCatalogRecords(page: Page): Promise<void> {
  await page.evaluate(async (createdAt) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['libraryItems', 'standards'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        transaction.objectStore('libraryItems').put({
          id: 'responsive-library-activity',
          catalogType: 'activity',
          title:
            'Collaborative multilingual fraction comparison routine with visual models and partner explanation prompts',
          description:
            'A deliberately long reusable Activity title used to verify that catalog controls wrap safely.',
          tags: ['Fractions', 'Speaking'],
          typedFields: {
            catalogType: 'activity',
            grouping: 'partners',
            estimatedMinutes: 25,
          },
          status: 'active',
          createdAt,
          updatedAt: createdAt,
        });

        transaction.objectStore('standards').put({
          id: 'responsive-standard',
          issuingOrganization: 'Synthetic National Mathematics Standards Consortium',
          frameworkTitle:
            'Comprehensive Framework for Mathematical Reasoning, Communication, Representation, and Fraction Sense',
          jurisdiction: 'Synthetic national scope',
          subject: 'Mathematics and mathematical communication',
          gradeBand: 'Grade 3 multilingual immersion learners',
          version: '2026 extended responsive-label edition',
          frameworkKey: 'synthetic-responsive-mathematics-2026',
          code: '3.NF.REASONING.COMMUNICATION.EXTENDED.1',
          normalizedCode: '3.nf.reasoning.communication.extended.1',
          statement:
            'Compare unit fractions, explain the comparison with visual models, and communicate how equal-sized wholes determine the meaning of the comparison.',
          sortOrder: 0,
          status: 'active',
          createdAt,
          updatedAt: createdAt,
        });
      });
    } finally {
      database.close();
    }
  }, timestamp);
}

async function expectChildrenContained(locator: Locator): Promise<void> {
  expect(
    await locator.evaluate((element) => {
      const parent = element.getBoundingClientRect();
      return [...element.children].every((child) => {
        const rect = child.getBoundingClientRect();
        return rect.left >= parent.left - 1 && rect.right <= parent.right + 1;
      });
    }),
  ).toBe(true);
}

async function expectColorToken(locator: Locator, tokenName: string): Promise<void> {
  const colors = await locator.evaluate((element, name) => {
    const token = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const probe = document.createElement('span');
    probe.style.color = token;
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();

    return {
      actual: getComputedStyle(element).color,
      expected,
    };
  }, tokenName);

  expect(colors.actual).toBe(colors.expected);
}

test('Library and Standards keep long catalog labels inside responsive controls', async ({
  page,
}) => {
  await page.goto('./#/library');
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 8,
    );
  });
  await seedLongCatalogRecords(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  const libraryMain = page.locator('#main-content');
  await expect(libraryMain.getByRole('link', { name: /Open Standards/ })).toHaveCount(0);
  await libraryMain.getByRole('button', { name: 'Activities', exact: true }).click();
  await expect(
    libraryMain.getByRole('button', { name: 'Activities', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  const libraryItem = libraryMain.getByRole('button', {
    name: /Collaborative multilingual fraction comparison routine/,
  });
  await expect(libraryItem).toBeVisible();
  await expectChildrenContained(libraryItem);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  await page.goto('./#/standards');
  const standardsMain = page.locator('#main-content');
  await expect(standardsMain.getByRole('heading', { level: 1, name: 'Standards' })).toBeVisible();
  await expect(standardsMain.getByRole('link', { name: 'Open Library' })).toHaveCount(0);

  const standardItem = standardsMain.getByRole('button', {
    name: /3\.NF\.REASONING\.COMMUNICATION\.EXTENDED\.1/,
  });
  await expect(standardItem).toBeVisible();
  await expectChildrenContained(standardItem);

  await expectColorToken(
    standardsMain.getByText(/Manage framework-aware Standard identities/),
    '--text-secondary',
  );
  await expectColorToken(
    standardsMain.getByRole('region', { name: 'Standard filters' }).getByText('Search', {
      exact: true,
    }),
    '--heading',
  );
  await expectColorToken(standardItem.locator('small').first(), '--text-secondary');
  await expectColorToken(standardItem.locator('[data-status="active"]'), '--accent-strong');

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations,
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});

test('Standards keeps its header action and filters inside the desktop workspace', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('./#/standards');
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 8,
    );
  });
  await seedLongCatalogRecords(page);
  await page.reload();

  const main = page.locator('#main-content');
  const filters = main.getByRole('region', { name: 'Standard filters' });
  const newStandard = main.getByRole('button', { name: 'New Standard' });

  await expect(filters).toBeVisible();
  await expect(main.getByRole('link', { name: 'Open Library' })).toHaveCount(0);
  await expect(newStandard).toBeVisible();

  expect(
    await filters.evaluate((element) => {
      const parent = element.getBoundingClientRect();
      const controls = element.querySelectorAll('input, select, button');
      return [...controls].every((control) => {
        const rect = control.getBoundingClientRect();
        return (
          rect.left >= parent.left - 1 &&
          rect.right <= parent.right + 1 &&
          rect.top >= parent.top - 1 &&
          rect.bottom <= parent.bottom + 1
        );
      });
    }),
  ).toBe(true);

  const mainBox = await main.boundingBox();
  const newStandardBox = await newStandard.boundingBox();

  expect(mainBox).not.toBeNull();
  expect(newStandardBox).not.toBeNull();
  expect(newStandardBox!.x).toBeGreaterThanOrEqual(mainBox!.x - 1);
  expect(newStandardBox!.x + newStandardBox!.width).toBeLessThanOrEqual(
    mainBox!.x + mainBox!.width + 1,
  );

  const standardItem = main.getByRole('button', {
    name: /3\.NF\.REASONING\.COMMUNICATION\.EXTENDED\.1/,
  });
  await expect(standardItem).toBeVisible();
  await expectChildrenContained(standardItem);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});

test('Standards follows the lesson-template catalog workspace pattern', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto('./#/standards');
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 8,
    );
  });

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['standards', 'standardAlignments'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('standards').clear();
        transaction.objectStore('standardAlignments').clear();
      });
    } finally {
      database.close();
    }
  });

  await page.reload();

  const main = page.locator('#main-content');
  const filters = main.getByRole('region', { name: 'Standard filters' });
  const clearFilters = filters.getByRole('button', { name: 'Clear filters' });
  const results = main.getByRole('region', { name: 'Standard results' });
  const details = main.getByRole('region', { name: 'Standard details' });

  await expect(filters.getByText('Filter Standards', { exact: true })).toHaveCount(0);
  await expect(clearFilters).toBeVisible();
  await expect(clearFilters).toBeDisabled();
  const emptyHeading = results.getByText('No matching Standards', { exact: true });
  const emptyCopy = results.getByText(
    'Adjust the filters or create the first framework-aware Standard.',
    { exact: true },
  );
  await expect(emptyHeading).toBeVisible();
  await expect(details.getByText('Select a Standard', { exact: true })).toBeVisible();
  await expectColorToken(emptyHeading, '--heading');
  await expectColorToken(emptyCopy, '--text-secondary');

  const filterControls = await Promise.all(
    [
      main.getByLabel('Search'),
      main.getByLabel('Status'),
      main.getByLabel('Framework'),
      main.getByLabel('Subject'),
      main.getByLabel('Grade band'),
    ].map((control) => control.boundingBox()),
  );

  for (const box of filterControls) expect(box).not.toBeNull();
  const controlTops = filterControls.map((box) => box!.y);
  expect(Math.max(...controlTops) - Math.min(...controlTops)).toBeLessThanOrEqual(6);

  const clearBox = await clearFilters.boundingBox();
  expect(clearBox).not.toBeNull();
  expect(clearBox!.width).toBeLessThan(240);
  const gradeBandBox = filterControls.at(-1)!;
  expect(
    Math.abs(clearBox!.y + clearBox!.height - (gradeBandBox!.y + gradeBandBox!.height)),
  ).toBeLessThanOrEqual(6);

  const resultsBox = await results.boundingBox();
  const detailsBox = await details.boundingBox();
  expect(resultsBox).not.toBeNull();
  expect(detailsBox).not.toBeNull();
  expect(Math.abs(resultsBox!.y - detailsBox!.y)).toBeLessThanOrEqual(2);
  expect(resultsBox!.width).toBeLessThan(detailsBox!.width);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});
