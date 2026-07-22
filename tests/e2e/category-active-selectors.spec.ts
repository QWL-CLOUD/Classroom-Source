import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const now = '2026-07-22T15:00:00.000Z';

async function seedCategorySelectorFoundation(page: Page): Promise<void> {
  await page.evaluate(async (timestamp) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const categoryValue = (
      id: string,
      familyId: string,
      name: string,
      sortOrder: number,
      isDefault = false,
    ) => ({
      id,
      familyId,
      name,
      normalizedName: name.toLowerCase(),
      aliases: [],
      normalizedAliases: [],
      sortOrder,
      isDefault,
      lifecycleState: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['schoolYears', 'learnerContexts', 'categoryValues'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('schoolYears').put({
          id: 'category-selector-year',
          label: 'Category Selector 2026–2027',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          active: true,
        });
        transaction.objectStore('learnerContexts').put({
          id: 'category-selector-learner',
          kind: 'individual',
          name: 'Category Integration Learner',
          schoolYearId: 'category-selector-year',
          status: 'active',
        });
        const values = [
          categoryValue('focus-speaking', 'focus-tag', 'Speaking', 0, true),
          categoryValue('focus-reading', 'focus-tag', 'Reading', 1),
          categoryValue('purpose-practice', 'purpose-tag', 'Practice', 0),
          categoryValue('theme-school', 'theme-tag', 'School', 0),
          categoryValue('task-priority', 'task-label', 'Priority', 0, true),
          categoryValue('task-family', 'task-label', 'Family', 1),
          categoryValue('support-reading', 'support-area', 'Reading support', 0, true),
        ];
        for (const value of values) transaction.objectStore('categoryValues').put(value);
      });
    } finally {
      database.close();
    }
  }, now);
}

async function findEntityIdByTitle(
  page: Page,
  storeName: 'lessonPlans' | 'tasks' | 'learnerNotices',
  title: string,
): Promise<string> {
  return page.evaluate(
    async ({ store, expectedTitle }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('classroom-v20');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        return await new Promise<string>((resolve, reject) => {
          const transaction = database.transaction(store, 'readonly');
          const request = transaction.objectStore(store).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const record = (request.result as Array<{ id: string; title?: string }>).find(
              (candidate) => candidate.title === expectedTitle,
            );
            if (!record) reject(new Error(`${store} record not found.`));
            else resolve(record.id);
          };
        });
      } finally {
        database.close();
      }
    },
    { store: storeName, expectedTitle: title },
  );
}

async function expectAssignment(
  page: Page,
  entityType: string,
  entityId: string,
  valueId: string,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        async ({ expectedEntityType, expectedEntityId, expectedValueId }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('classroom-v20');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
          try {
            return await new Promise<boolean>((resolve, reject) => {
              const transaction = database.transaction('categoryAssignments', 'readonly');
              const request = transaction.objectStore('categoryAssignments').getAll();
              request.onerror = () => reject(request.error);
              request.onsuccess = () =>
                resolve(
                  (request.result as Array<Record<string, unknown>>).some(
                    (assignment) =>
                      assignment.entityType === expectedEntityType &&
                      assignment.entityId === expectedEntityId &&
                      assignment.categoryValueId === expectedValueId,
                  ),
                );
            });
          } finally {
            database.close();
          }
        },
        { expectedEntityType: entityType, expectedEntityId: entityId, expectedValueId: valueId },
      ),
    )
    .toBe(true);
}

async function renameAndArchiveFocusValue(page: Page): Promise<void> {
  await page.evaluate(async (timestamp) => {
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
        const request = store.get('focus-speaking');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          store.put({
            ...(request.result as Record<string, unknown>),
            name: 'Speaking & Listening',
            normalizedName: 'speaking & listening',
            aliases: ['Speaking'],
            normalizedAliases: ['speaking'],
            isDefault: false,
            lifecycleState: 'archived',
            archivedAt: timestamp,
            updatedAt: timestamp,
          });
        };
      });
    } finally {
      database.close();
    }
  }, now);
}

test('active category selectors preserve stable assignments across planning, tasks, and support', async ({
  page,
}) => {
  await page.goto('./#/planning/edit?context=category-selector-learner&return=learners');
  await seedCategorySelectorFoundation(page);
  await page.reload();

  const focusTags = page.getByRole('group', { name: 'Focus Tags' });
  await expect(focusTags.getByRole('checkbox', { name: /Speaking/ })).toBeChecked();
  await focusTags.getByRole('checkbox', { name: /Reading/ }).check();
  await page
    .getByRole('group', { name: 'Purpose Tags' })
    .getByRole('checkbox', { name: 'Practice' })
    .check();
  await page.getByLabel('Title').fill('Category-linked lesson');
  await page.getByRole('button', { name: 'Save plan' }).click();

  const planId = await findEntityIdByTitle(page, 'lessonPlans', 'Category-linked lesson');
  await expectAssignment(page, 'lesson-plan', planId, 'focus-speaking');
  await expectAssignment(page, 'lesson-plan', planId, 'focus-reading');
  await expectAssignment(page, 'lesson-plan', planId, 'purpose-practice');

  await renameAndArchiveFocusValue(page);
  await page.goto(`./#/planning/edit?plan=${planId}&return=learners`);
  // The helper above writes through raw IndexedDB rather than Dexie, so a
  // full reload is required to refresh Dexie's liveQuery snapshot.
  await page.reload();
  const historicalFocus = page.getByRole('group', { name: 'Focus Tags' });
  await expect(
    historicalFocus.getByRole('checkbox', { name: /Speaking & Listening.*Archived/ }),
  ).toBeChecked();

  await page.goto('./#/planning/edit?context=category-selector-learner&return=learners');
  await expect(
    page.getByRole('group', { name: 'Focus Tags' }).getByText('Speaking & Listening'),
  ).toHaveCount(0);

  await page.goto('./#/tasks');
  await page.getByRole('button', { name: 'New task' }).click();
  const taskEditor = page.getByRole('region', { name: 'New task' });
  await expect(
    taskEditor
      .getByRole('group', { name: 'Task Labels' })
      .getByRole('checkbox', { name: /Priority/ }),
  ).toBeChecked();
  await taskEditor.getByLabel('Task title').fill('Category-linked task');
  await taskEditor.getByRole('button', { name: 'Create task' }).click();
  const taskId = await findEntityIdByTitle(page, 'tasks', 'Category-linked task');
  await expectAssignment(page, 'task', taskId, 'task-priority');

  await page.goto('./#/learners?context=category-selector-learner');
  await page.getByRole('tab', { name: 'Support & Notices' }).click();
  const supportPanel = page.getByRole('region', {
    name: 'Support and notices for Category Integration Learner',
  });
  await supportPanel.getByRole('button', { name: 'New record' }).click();
  await expect(
    supportPanel
      .getByRole('group', { name: 'Support Areas' })
      .getByRole('checkbox', { name: /Reading support/ }),
  ).toBeChecked();
  await supportPanel.getByLabel('Title').fill('Category-linked support');
  await supportPanel.getByRole('button', { name: 'Create record' }).click();
  const noticeId = await findEntityIdByTitle(page, 'learnerNotices', 'Category-linked support');
  await expectAssignment(page, 'learner-notice', noticeId, 'support-reading');

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
