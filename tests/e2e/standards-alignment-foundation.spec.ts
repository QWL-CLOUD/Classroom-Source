import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const timestamp = '2026-07-24T04:00:00.000Z';

const records = {
  schoolYears: [
    {
      id: 'phase-3f-1-year',
      label: 'Synthetic 2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    },
  ],
  learnerContexts: [
    {
      id: 'phase-3f-1-context',
      kind: 'class',
      name: 'Synthetic standards class',
      schoolYearId: 'phase-3f-1-year',
      status: 'active',
    },
  ],
  lessonPlans: [
    {
      id: 'phase-3f-1-plan',
      contextId: 'phase-3f-1-context',
      title: 'Unit fraction comparison',
      subject: 'Math',
      workflowState: 'draft',
      lessonFlow: [
        {
          id: 'phase-3f-1-plan-step',
          title: 'Compare fraction models',
          phase: 'guided-practice',
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  lessonTemplates: [
    {
      id: 'phase-3f-1-template',
      title: 'Fraction comparison workshop',
      subject: 'Math',
      status: 'active',
      lessonFlow: [
        {
          id: 'phase-3f-1-template-step',
          title: 'Compare fraction models',
          phase: 'guided-practice',
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
};

async function seed(page: Page): Promise<void> {
  await page.evaluate(async (values: typeof records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(Object.keys(values), 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        for (const [storeName, storeValues] of Object.entries(values)) {
          const store = transaction.objectStore(storeName);
          for (const value of storeValues) store.put(value);
        }
      });
    } finally {
      database.close();
    }
  }, records);
}

async function readStore(page: Page, storeName: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const transaction = database.transaction([name], 'readonly');
        const request = transaction.objectStore(name).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
      });
    } finally {
      database.close();
    }
  }, storeName);
}

test('Standards remain independent sources and align explicitly to Plans, steps, and Templates', async ({
  page,
}) => {
  await page.goto('./#/standards');
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 8,
    );
  });
  await seed(page);
  await page.reload();

  await page.getByRole('button', { name: 'New Standard' }).click();
  const editor = page.getByRole('form', { name: 'Standard editor' });
  await editor.getByLabel('Issuing organization').fill('Common Core State Standards Initiative');
  await editor.getByLabel('Framework title').fill('Common Core State Standards for Mathematics');
  await editor.getByLabel('Jurisdiction or scope').fill('United States');
  await editor.getByLabel('Version or publication year').fill('2010');
  await editor.getByLabel('Subject').fill('Math');
  await editor.getByLabel('Grade band or level').fill('3');
  await editor.getByLabel('Standard code').fill('3.NF.A.3');
  await editor
    .getByLabel('Standard statement')
    .fill('Explain equivalence of fractions in special cases, and compare fractions.');
  await editor.getByRole('button', { name: 'Create Standard' }).click();

  const details = page.getByRole('article', { name: '3.NF.A.3 Standard details' });
  await expect(details).toBeVisible();
  await expect(
    details.getByText('Common Core State Standards for Mathematics', {
      exact: true,
    }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations,
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);

  await details.getByRole('button', { name: 'Archive' }).click();
  await expect(details.locator('[data-status="archived"]')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(details.locator('[data-status="active"]')).toBeVisible();

  await page.goto(
    './#/planning/edit?plan=phase-3f-1-plan&context=phase-3f-1-context&date=2026-07-24&return=learners',
  );
  const planAlignment = page.getByRole('region', { name: 'Standards alignment' });
  const planScope = planAlignment.getByRole('group', { name: 'Plan-level alignment' });
  const planStepScope = planAlignment.getByRole('group', {
    name: 'Step 1: Compare fraction models',
  });
  await planScope.getByRole('checkbox', { name: /3\.NF\.A\.3/ }).check();
  await planStepScope.getByRole('checkbox', { name: /3\.NF\.A\.3/ }).check();
  await planAlignment.getByRole('button', { name: 'Save alignments' }).click();
  await expect(planAlignment.getByText('Standards alignment saved.')).toBeVisible();

  await expect.poll(() => readStore(page, 'standardAlignments')).toHaveLength(2);
  const planAlignments = await readStore(page, 'standardAlignments');
  expect(planAlignments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        targetType: 'lesson-plan',
        targetId: 'phase-3f-1-plan',
        scopeKey: 'lesson-plan:phase-3f-1-plan:root',
      }),
      expect.objectContaining({
        lessonFlowStepId: 'phase-3f-1-plan-step',
        scopeKey: 'lesson-plan:phase-3f-1-plan:step:phase-3f-1-plan-step',
      }),
    ]),
  );

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => readStore(page, 'standardAlignments')).toHaveLength(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => readStore(page, 'standardAlignments')).toHaveLength(2);

  await page.goto('./#/templates');
  const templateDetails = page.getByRole('article', {
    name: 'Fraction comparison workshop lesson template details',
  });
  await expect(templateDetails).toBeVisible();
  const templateAlignment = templateDetails.getByRole('region', {
    name: 'Standards alignment',
  });
  const templateScope = templateAlignment.getByRole('group', {
    name: 'Template-level alignment',
  });
  await templateScope.getByRole('checkbox', { name: /3\.NF\.A\.3/ }).check();
  await templateAlignment.getByRole('button', { name: 'Save alignments' }).click();
  await expect.poll(() => readStore(page, 'standardAlignments')).toHaveLength(3);

  await page.goto('./#/standards');
  await page
    .getByRole('article', { name: '3.NF.A.3 Standard details' })
    .getByRole('button', { name: 'Archive' })
    .click();
  await page.goto(
    './#/planning/edit?plan=phase-3f-1-plan&context=phase-3f-1-context&date=2026-07-24&return=learners',
  );
  const archivedPlanAlignment = page.getByRole('region', { name: 'Standards alignment' });
  await expect(
    archivedPlanAlignment.getByRole('checkbox', { name: /3\.NF\.A\.3 · Archived/ }).first(),
  ).toBeChecked();
  expect(await readStore(page, 'standards')).toEqual([
    expect.objectContaining({
      code: '3.NF.A.3',
      status: 'archived',
    }),
  ]);
});
