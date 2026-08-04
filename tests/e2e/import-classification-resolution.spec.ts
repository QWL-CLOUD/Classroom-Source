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

interface SeedCategoryValue {
  id: string;
  familyId: string;
  name: string;
  aliases?: string[];
  lifecycleState?: 'active' | 'archived' | 'merged';
  mergedIntoId?: string;
}

async function seedCategoryValues(page: Page, values: SeedCategoryValue[]): Promise<void> {
  await waitForSchema(page);
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const timestamp = '2026-08-03T12:00:00.000Z';
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('categoryValues', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        const store = transaction.objectStore('categoryValues');
        records.forEach((record, sortOrder) => {
          const lifecycleState = record.lifecycleState ?? 'active';
          store.put({
            id: record.id,
            familyId: record.familyId,
            name: record.name,
            normalizedName: record.name.toLocaleLowerCase('en-US'),
            aliases: record.aliases ?? [],
            normalizedAliases: (record.aliases ?? []).map((alias) =>
              alias.toLocaleLowerCase('en-US'),
            ),
            sortOrder,
            isDefault: false,
            lifecycleState,
            mergedIntoId: record.mergedIntoId,
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: lifecycleState === 'archived' ? timestamp : undefined,
            mergedAt: lifecycleState === 'merged' ? timestamp : undefined,
          });
        });
      });
    } finally {
      database.close();
    }
  }, values);
}

async function readLibraryClassificationState(page: Page, title: string) {
  return page.evaluate(async (expectedTitle) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const transaction = database.transaction(
        ['libraryItems', 'categoryValues', 'categoryAssignments'],
        'readonly',
      );
      const all = <T>(store: string) =>
        new Promise<T[]>((resolve, reject) => {
          const request = transaction.objectStore(store).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result as T[]);
        });
      const [items, values, assignments] = await Promise.all([
        all<Record<string, unknown>>('libraryItems'),
        all<Record<string, unknown>>('categoryValues'),
        all<Record<string, unknown>>('categoryAssignments'),
      ]);
      const item = items.find((candidate) => candidate.title === expectedTitle);
      const itemAssignments = assignments.filter((assignment) => assignment.entityId === item?.id);
      return {
        item,
        values,
        assignments: itemAssignments,
        assignedFamilies: itemAssignments.map((assignment) => assignment.familyId).sort(),
      };
    } finally {
      database.close();
    }
  }, title);
}

test('active names and aliases resolve automatically and become usable Library facets', async ({
  page,
}) => {
  const title = 'Canonical Alias Activity 3I-H';
  await page.goto('./#/import?type=activities');
  await seedCategoryValues(page, [
    { id: 'subject-mathematics', familyId: 'subject', name: 'Mathematics', aliases: ['Math'] },
    { id: 'grade-3', familyId: 'grade-level', name: 'Grade 3' },
    { id: 'language-chinese', familyId: 'language', name: 'Chinese' },
    { id: 'level-intermediate', familyId: 'language-level', name: 'Intermediate' },
    { id: 'activity-role-play', familyId: 'activity-type', name: 'Role-play' },
    { id: 'purpose-practice', familyId: 'purpose-tag', name: 'Practice' },
    { id: 'focus-speaking', familyId: 'focus-tag', name: 'Speaking' },
  ]);
  await page.reload();

  await page.getByLabel('Pasted table').check();
  await page
    .getByLabel('Paste a table with one header row')
    .fill(
      [
        'title\tsubject\tgrade_level\tlanguage\tlanguage_level\tactivity_type\tpurpose\tskill\ttags',
        `${title}\tMath\tGrade 3\tChinese\tIntermediate\tRole-play\tPractice\tSpeaking\tPartner`,
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  await expect(
    page.getByLabel('Activity import preview summary').getByText('Create', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /Resolve probable duplicates/ })).toHaveCount(0);
  await page.getByLabel(/Commit records, status, tags/).check();
  await page.getByRole('button', { name: 'Commit reviewed Activities' }).click();

  await expect
    .poll(() => readLibraryClassificationState(page, title))
    .toMatchObject({
      item: { title, tags: ['Partner'] },
      assignedFamilies: [
        'activity-type',
        'focus-tag',
        'grade-level',
        'language',
        'language-level',
        'purpose-tag',
        'subject',
      ],
    });

  await page.getByRole('link', { name: 'Open Library Activities' }).click();
  const facets = page.getByRole('region', { name: 'Library classification filters' });
  const mathematics = facets.getByRole('checkbox', { name: /^Mathematics \(\d+\)$/ });
  await expect(mathematics).toBeVisible();
  await mathematics.check();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
});

test('archived, merged, and generic-tag decisions are explicit, compact, and atomic', async ({
  page,
}) => {
  const title = 'Reviewed Assessment Classifications 3I-H';
  await page.goto('./#/import?type=assessments');
  await seedCategoryValues(page, [
    {
      id: 'level-intermediate',
      familyId: 'language-level',
      name: 'Intermediate',
      lifecycleState: 'archived',
    },
    { id: 'purpose-practice', familyId: 'purpose-tag', name: 'Practice' },
    {
      id: 'purpose-old-practice',
      familyId: 'purpose-tag',
      name: 'Old practice',
      lifecycleState: 'merged',
      mergedIntoId: 'purpose-practice',
    },
  ]);
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByLabel('Pasted table').check();
  await page
    .getByLabel('Paste Assessment rows with one header row')
    .fill(
      [
        'Title\tAssessment Kind\tLanguage Level\tPurpose\tSkill',
        `${title}\tFormative\tIntermediate\tOld practice\tNew focus`,
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  await page
    .getByLabel('Language Level resolution for Intermediate')
    .selectOption({ label: 'Restore and use “Intermediate”' });
  await page
    .getByLabel('Purpose resolution for Old practice')
    .selectOption({ label: 'Use merged replacement “Practice”' });
  await page
    .getByLabel('Skill / Focus resolution for New focus')
    .selectOption({ label: 'Keep as a generic searchable tag' });

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: 'Regenerate reviewed preview' }).click();
  await expect(
    page.getByLabel('Assessment import preview').getByText('Create', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Commit the complete reviewed Assessment preview.').check();
  await page.getByRole('button', { name: 'Commit reviewed Assessments' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Committed 1 new' })).toContainText(
    'Committed 1 new',
  );

  const state = await readLibraryClassificationState(page, title);
  expect(state.item).toMatchObject({ title, tags: ['Focus: New focus'] });
  expect(state.assignedFamilies).toEqual(['language-level', 'purpose-tag']);
  expect(state.values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'level-intermediate', lifecycleState: 'active' }),
      expect.objectContaining({ id: 'purpose-old-practice', lifecycleState: 'merged' }),
      expect.objectContaining({ id: 'purpose-practice', lifecycleState: 'active' }),
    ]),
  );
});
