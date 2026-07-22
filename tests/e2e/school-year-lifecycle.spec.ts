import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function addHistoricalLearnerContext(page: Page, schoolYearLabel: string): Promise<string> {
  return page.evaluate(async (label) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      const schoolYear = await new Promise<Record<string, unknown> | undefined>(
        (resolve, reject) => {
          const transaction = database.transaction('schoolYears', 'readonly');
          const request = transaction.objectStore('schoolYears').getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () =>
            resolve(
              (request.result as Array<Record<string, unknown>>).find(
                (candidate) => candidate.label === label,
              ),
            );
        },
      );
      if (!schoolYear || typeof schoolYear.id !== 'string')
        throw new Error('School year not found.');

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('learnerContexts', 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('learnerContexts').put({
          id: 'historical-class',
          kind: 'class',
          name: 'Historical Grade 3',
          schoolYearId: schoolYear.id,
          status: 'active',
        });
      });
      return schoolYear.id;
    } finally {
      database.close();
    }
  }, schoolYearLabel);
}

test('school year lifecycle prepares rollover, preserves history, and stays globally undoable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/system-health');
  await page.getByRole('link', { name: 'Manage school years' }).click();

  await expect(page).toHaveURL(/#\/settings/);
  await expect(page.getByRole('heading', { level: 1, name: 'School Years' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'No active school year' }).first()).toBeVisible();

  const editor = page.getByRole('region', { name: 'School year editor' });
  await editor.getByLabel('School year name').fill('2026–2027');
  await editor.getByLabel('Start date').fill('2026-07-01');
  await editor.getByLabel('End date').fill('2027-06-30');
  await expect(editor.getByLabel('Set as active when created')).toBeChecked();
  await editor.getByRole('button', { name: 'Save school year' }).click();

  await expect(page.getByText('Created 2026–2027 and set it as active.')).toBeVisible();
  await expect(page.getByRole('article', { name: '2026–2027 school year' })).toContainText(
    'Active',
  );
  await expect(page.getByRole('link', { name: '2026–2027' }).first()).toBeVisible();

  const historicalSchoolYearId = await addHistoricalLearnerContext(page, '2026–2027');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'School Years' })).toBeVisible();
  await expect(page.getByRole('article', { name: '2026–2027 school year' })).toContainText(
    '1 learner context',
  );

  await page.getByRole('button', { name: 'Prepare next school year' }).click();
  await expect(editor.getByLabel('School year name')).toHaveValue('2027–2028');
  await expect(editor.getByLabel('Start date')).toHaveValue('2027-07-01');
  await expect(editor.getByLabel('End date')).toHaveValue('2028-06-30');
  await expect(editor.getByLabel('Set as active when created')).not.toBeChecked();
  await editor.getByRole('button', { name: 'Save school year' }).click();
  await expect(page.getByText(/Prepared 2027–2028/)).toBeVisible();

  const nextYear = page.getByRole('article', { name: '2027–2028 school year' });
  page.once('dialog', (dialog) => dialog.accept());
  await nextYear.getByRole('button', { name: 'Set active' }).click();
  await expect(page.getByText('2027–2028 is now the active school year.')).toBeVisible();
  await expect(page.getByRole('link', { name: '2027–2028' }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Learners', exact: true }).click();
  const yearPicker = page.getByRole('combobox', { name: 'School year', exact: true });
  await expect(yearPicker).toContainText('2026–2027');
  await yearPicker.selectOption(historicalSchoolYearId);
  await expect(yearPicker).toHaveValue(historicalSchoolYearId);
  await expect(page).toHaveURL(
    new RegExp(`schoolYear=${encodeURIComponent(historicalSchoolYearId)}`),
  );
  await expect(
    page
      .getByRole('region', { name: 'Learner contexts' })
      .getByRole('button', { name: 'Open Historical Grade 3 class', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('link', { name: '2026–2027' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('link', { name: '2027–2028' }).first()).toBeVisible();

  await page.goto('./#/settings');
  const historicalYear = page.getByRole('article', { name: '2026–2027 school year' });
  page.once('dialog', (dialog) => dialog.accept());
  await historicalYear.getByRole('button', { name: 'Archive' }).click();
  await expect(historicalYear).toContainText('Archived');
  await expect(historicalYear.getByRole('button', { name: 'Delete empty year' })).toBeDisabled();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
