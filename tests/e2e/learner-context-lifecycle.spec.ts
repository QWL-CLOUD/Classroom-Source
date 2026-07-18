import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const lifecycleRecords = {
  schoolYears: [
    {
      id: 'phase-3c-6a-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'phase-3c-6a-linked-class',
      kind: 'class',
      name: 'Lifecycle Grade 3',
      schoolYearId: 'phase-3c-6a-year',
      status: 'active',
      notes: 'Original lifecycle notes.',
    },
    {
      id: 'phase-3c-6a-empty-individual',
      kind: 'individual',
      name: 'Empty lifecycle learner',
      schoolYearId: 'phase-3c-6a-year',
      status: 'active',
    },
    {
      id: 'phase-3c-6a-archived-group',
      kind: 'group',
      name: 'Previously archived group',
      schoolYearId: 'phase-3c-6a-year',
      status: 'archived',
    },
  ],
  lessonPlans: [
    {
      id: 'phase-3c-6a-history-plan',
      contextId: 'phase-3c-6a-linked-class',
      title: 'Preserved teaching history',
      subject: 'Language',
      workflowState: 'ready',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-15T12:00:00.000Z',
    },
  ],
  sessionOccurrences: [
    {
      id: 'phase-3c-6a-history-session',
      lessonPlanId: 'phase-3c-6a-history-plan',
      contextId: 'phase-3c-6a-linked-class',
      date: '2026-07-15',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'completed',
      completedAt: '2026-07-15T15:00:00.000Z',
    },
  ],
};

async function seedLifecycleRecords(page: Page): Promise<void> {
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const storeNames = Object.keys(records);
        const transaction = database.transaction(storeNames, 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        for (const [storeName, values] of Object.entries(records)) {
          const store = transaction.objectStore(storeName);
          for (const value of values) store.put(value);
        }
      });
    } finally {
      database.close();
    }
  }, lifecycleRecords);
}

test('Learner lifecycle preserves history, blocks linked deletion, and safely deletes an empty context', async ({
  page,
}) => {
  await page.goto('./#/learners?date=2026-07-18');
  await seedLifecycleRecords(page);
  await page.reload();

  const contexts = page.getByRole('region', { name: 'Learner contexts' });
  await expect(contexts.getByRole('button', { name: /Active 2/ })).toBeVisible();
  await expect(contexts.getByRole('button', { name: /Archived 1/ })).toBeVisible();

  const details = page.getByRole('region', { name: 'Lifecycle Grade 3 details' });
  await details.getByRole('button', { name: 'Edit details' }).click();
  await details.getByLabel('Name', { exact: true }).fill('Renamed Lifecycle Grade 3');
  await details.getByLabel('Preferred name').fill('Lifecycle Class');
  await details.getByLabel('Notes').fill('Updated lifecycle notes.');
  await details.getByRole('button', { name: 'Save details' }).click();

  const renamedDetails = page.getByRole('region', { name: 'Renamed Lifecycle Grade 3 details' });
  await expect(
    renamedDetails.getByRole('heading', { name: 'Renamed Lifecycle Grade 3' }),
  ).toBeVisible();
  await expect(renamedDetails.getByText('Preferred name: Lifecycle Class')).toBeVisible();
  await expect(renamedDetails.getByText('Updated lifecycle notes.')).toBeVisible();
  await expect(
    contexts.getByRole('button', { name: 'Open Renamed Lifecycle Grade 3 class' }),
  ).toBeVisible();

  await renamedDetails.getByRole('button', { name: 'Check delete safety' }).click();
  await expect(
    renamedDetails.getByText('Delete is blocked to protect teaching history.'),
  ).toBeVisible();
  await expect(renamedDetails.getByText('1 Plans')).toBeVisible();
  await expect(renamedDetails.getByText('1 Sessions')).toBeVisible();

  await renamedDetails.getByRole('button', { name: 'Archive' }).click();
  await expect(page).toHaveURL(/status=archived/);
  await expect(
    page.getByRole('region', { name: 'Planning for Renamed Lifecycle Grade 3' }),
  ).toBeVisible();
  await expect(page.getByText('Restore this context to add a Plan.')).toBeVisible();
  await page.getByRole('tab', { name: /Completed/ }).click();
  await expect(page.getByText('Preserved teaching history')).toBeVisible();

  await page
    .getByRole('region', { name: 'Renamed Lifecycle Grade 3 details' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(page).toHaveURL(/status=active/);
  await expect(page.getByRole('link', { name: 'New plan' })).toBeVisible();

  await contexts.getByRole('button', { name: 'Open Empty lifecycle learner individual' }).click();
  const emptyDetails = page.getByRole('region', { name: 'Empty lifecycle learner details' });
  await emptyDetails.getByRole('button', { name: 'Check delete safety' }).click();
  await expect(emptyDetails.getByText(/No linked records were found/)).toBeVisible();
  await emptyDetails.getByRole('button', { name: 'Confirm delete empty context' }).click();
  await expect(
    contexts.getByRole('button', { name: 'Open Empty lifecycle learner individual' }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    contexts.getByRole('button', { name: 'Open Empty lifecycle learner individual' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(
    contexts.getByRole('button', { name: 'Open Empty lifecycle learner individual' }),
  ).toHaveCount(0);

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
