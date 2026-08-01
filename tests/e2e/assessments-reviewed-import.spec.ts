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

async function openAssessmentsImport(page: Page): Promise<void> {
  await page.goto('./#/import?type=assessments');
  await waitForSchema(page);
  await expect(page.getByRole('heading', { name: 'Import Assessments' })).toBeVisible();
}

test('Assessment workspace keeps its canonical header compact and offers formal templates', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openAssessmentsImport(page);

  const header = page.getByTestId('assessment-import-header');
  await expect(header).toBeVisible();
  await expect(header).not.toHaveClass(/\bcard\b/);
  const layout = await header.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      display: style.display,
      justifyContent: style.justifyContent,
      height: rect.height,
    };
  });
  expect(layout.display).toBe('flex');
  expect(layout.justifyContent).toBe('space-between');
  expect(layout.height).toBeLessThan(180);
  await expect(header.getByRole('button')).toHaveText(['Excel template', 'CSV template']);

  const xlsxDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel template' }).click();
  expect((await xlsxDownloadPromise).suggestedFilename()).toBe(
    'Classroom-Assessments-Import-Template.xlsx',
  );

  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV template' }).click();
  expect((await csvDownloadPromise).suggestedFilename()).toBe(
    'Classroom-Assessments-Import-Template.csv',
  );
});

test('Assessment preview is no-write and commits as one reviewed action', async ({ page }) => {
  await openAssessmentsImport(page);
  await page.getByLabel('Pasted table').check();
  await page
    .getByLabel('Paste Assessment rows with one header row')
    .fill(
      [
        'External Source\tAssessment ID\tTitle\tAssessment Kind\tStudent Prompt',
        'DEMO Catalog\tDEMO-ASM-101\tFictional quick check\tFormative\tShow a fictional response.',
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await expect(
    page.getByText(
      'Title is required. Description summarizes the Assessment. Student Prompt is the task shown to students. Evidence to Collect describes what the teacher should observe or collect. Images and attachments are not imported. Assessment Kind must resolve to one of the five controlled values.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await expect(
    page.getByLabel('Assessment import preview').getByText('Create', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Commit the complete reviewed Assessment preview.').check();
  await page.getByRole('button', { name: 'Commit reviewed Assessments' }).click();
  await expect(page.getByText(/Committed 1 new/)).toBeVisible();
});

test('unknown Assessment Kind requires an explicit reviewed value', async ({ page }) => {
  await openAssessmentsImport(page);
  await page.getByLabel('Pasted table').check();
  await page
    .getByLabel('Paste Assessment rows with one header row')
    .fill(['Title\tAssessment Kind', 'Fictional exit ticket\tQuiz'].join('\n'));
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await expect(
    page.getByLabel('Assessment import preview').getByText('Review', { exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: /Row 2/ }).selectOption('formative');
  await page.getByRole('button', { name: 'Regenerate reviewed preview' }).click();
  await expect(
    page.getByLabel('Assessment import preview').getByText('Create', { exact: true }),
  ).toBeVisible();
});

test('compact Assessment import stays keyboard reachable and axe-clean', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAssessmentsImport(page);
  await page.getByLabel('Pasted table').check();
  await page
    .getByLabel('Paste Assessment rows with one header row')
    .fill(['Title\tAssessment Kind', 'Fictional observation\tOther'].join('\n'));
  await page.getByRole('button', { name: 'Review pasted table' }).click();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  const scroller = page.getByLabel('Assessment import preview');
  await scroller.focus();
  await expect(scroller).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
