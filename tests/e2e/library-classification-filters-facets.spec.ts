import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seedFacetCatalog(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const timestamp = '2026-08-02T12:00:00.000Z';
    const categoryValues = [
      ['subject-mathematics', 'subject', 'Mathematics', 0],
      ['subject-science', 'subject', 'Science', 1],
      ['grade-3', 'grade-level', 'Grade 3', 0],
      ['grade-4', 'grade-level', 'Grade 4', 1],
      ['language-chinese', 'language', 'Chinese', 0],
      ['level-4', 'language-level', 'Level 4', 0],
      ['activity-role-play', 'activity-type', 'Role-play', 0],
      ['format-slides', 'resource-format', 'Slides', 0],
      ['purpose-practice', 'purpose-tag', 'Practice', 0],
      ['focus-speaking', 'focus-tag', 'Speaking', 0],
      ['subject-archived', 'subject', 'Archived subject', 2],
    ] as const;
    const items = [
      {
        id: 'facet-activity-math',
        catalogType: 'activity',
        title: 'Math partner role-play',
        tags: ['Partner'],
        typedFields: { catalogType: 'activity', grouping: 'partners' },
      },
      {
        id: 'facet-activity-science',
        catalogType: 'activity',
        title: 'Science partner role-play',
        tags: ['Partner'],
        typedFields: { catalogType: 'activity', grouping: 'partners' },
      },
      {
        id: 'facet-resource-math',
        catalogType: 'resource',
        title: 'Math slides',
        tags: ['Visual'],
        typedFields: { catalogType: 'resource' },
      },
      {
        id: 'facet-assessment-math',
        catalogType: 'assessment',
        title: 'Math speaking check',
        tags: ['Partner'],
        typedFields: { catalogType: 'assessment', assessmentKind: 'formative' },
      },
      {
        id: 'facet-standard',
        catalogType: 'standard',
        title: 'Legacy speaking standard',
        tags: [],
      },
    ] as const;
    const assignments = [
      ['a1', 'subject', 'subject-mathematics', 'facet-activity-math'],
      ['a2', 'grade-level', 'grade-3', 'facet-activity-math'],
      ['a3', 'activity-type', 'activity-role-play', 'facet-activity-math'],
      ['a4', 'purpose-tag', 'purpose-practice', 'facet-activity-math'],
      ['a5', 'focus-tag', 'focus-speaking', 'facet-activity-math'],
      ['a6', 'subject', 'subject-science', 'facet-activity-science'],
      ['a7', 'grade-level', 'grade-3', 'facet-activity-science'],
      ['a8', 'activity-type', 'activity-role-play', 'facet-activity-science'],
      ['a9', 'subject', 'subject-mathematics', 'facet-resource-math'],
      ['a10', 'grade-level', 'grade-4', 'facet-resource-math'],
      ['a11', 'resource-format', 'format-slides', 'facet-resource-math'],
      ['a12', 'subject', 'subject-mathematics', 'facet-assessment-math'],
      ['a13', 'grade-level', 'grade-3', 'facet-assessment-math'],
      ['a14', 'purpose-tag', 'purpose-practice', 'facet-assessment-math'],
      ['a15', 'focus-tag', 'focus-speaking', 'facet-assessment-math'],
    ] as const;

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['categoryValues', 'libraryItems', 'categoryAssignments'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        const valueStore = transaction.objectStore('categoryValues');
        for (const [id, familyId, name, sortOrder] of categoryValues) {
          valueStore.put({
            id,
            familyId,
            name,
            normalizedName: name.toLocaleLowerCase('en'),
            aliases: [],
            normalizedAliases: [],
            sortOrder,
            isDefault: false,
            lifecycleState: id === 'subject-archived' ? 'archived' : 'active',
            archivedAt: id === 'subject-archived' ? timestamp : undefined,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }

        const itemStore = transaction.objectStore('libraryItems');
        for (const item of items) {
          itemStore.put({
            ...item,
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }

        const assignmentStore = transaction.objectStore('categoryAssignments');
        for (const [id, familyId, categoryValueId, entityId] of assignments) {
          assignmentStore.put({
            id,
            familyId,
            categoryValueId,
            entityType: 'library-item',
            entityId,
            createdAt: timestamp,
          });
        }
      });
    } finally {
      database.close();
    }
  });
}

test('Library classification facets combine filters, counts, tabs, and clear behavior', async ({
  page,
}) => {
  await page.goto('./#/library');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 13,
    );
  });
  await seedFacetCatalog(page);
  await page.reload();

  const facets = page.getByRole('region', { name: 'Library classification filters' });
  await expect(facets.getByRole('group', { name: 'Subjects' })).toBeVisible();
  await expect(facets.getByRole('group', { name: 'Activity Types' })).toHaveCount(0);
  await expect(facets.getByRole('group', { name: 'Resource Formats' })).toHaveCount(0);
  await expect(facets.getByRole('checkbox', { name: 'Mathematics (3)' })).toBeVisible();
  await expect(facets.getByRole('checkbox', { name: /Archived subject/ })).toHaveCount(0);

  await facets.getByRole('checkbox', { name: 'Mathematics (3)' }).check();
  await facets.getByRole('checkbox', { name: 'Grade 3 (2)' }).check();
  await expect(page.getByRole('heading', { level: 2, name: '2 items' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Math partner role-play/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Math speaking check/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Math slides/ })).toHaveCount(0);

  await facets.getByRole('checkbox', { name: 'Science (1)' }).check();
  await expect(page.getByRole('heading', { level: 2, name: '3 items' })).toBeVisible();

  await page.getByLabel('Tag').selectOption('Partner');
  await expect(page.getByRole('heading', { level: 2, name: '3 items' })).toBeVisible();

  await page
    .getByLabel('Library catalog types')
    .getByRole('button', { name: 'Resources', exact: true })
    .click();
  await expect(page).toHaveURL(/tab=resources/);
  await expect(facets.getByRole('group', { name: 'Activity Types' })).toHaveCount(0);
  await expect(facets.getByRole('checkbox', { name: /Mathematics/ })).toBeChecked();
  await expect(facets.getByRole('checkbox', { name: /Science/ })).toBeChecked();
  await expect(page.getByRole('heading', { level: 2, name: '0 items' })).toBeVisible();

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/tab=resources/);
  await expect(page.getByRole('heading', { level: 2, name: '1 items' })).toBeVisible();
  await expect(facets.getByRole('checkbox', { name: 'Slides (1)' })).toBeVisible();

  await facets.getByRole('checkbox', { name: 'Slides (1)' }).check();
  await expect(page.getByRole('button', { name: /Math slides/ })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/tab=resources/);
  await expect(facets.getByRole('checkbox', { name: 'Slides (1)' })).not.toBeChecked();

  await page
    .getByLabel('Library catalog types')
    .getByRole('button', { name: 'Legacy Standards', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Library classification filters' })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/tab=resources/);
  await expect(page.getByRole('region', { name: 'Library classification filters' })).toBeVisible();
});

test('Library classification filters stay compact and accessible on mobile', async ({ page }) => {
  await page.goto('./#/library?tab=activities');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some((database) => database.name === 'classroom-v20');
  });
  await seedFacetCatalog(page);
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });

  const facets = page.getByRole('region', { name: 'Library classification filters' });
  await expect(facets.getByRole('group', { name: 'Activity Types' })).toBeVisible();
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
