import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const timestamp = '2026-08-07T12:00:00.000Z';

const records = {
  schoolYears: [
    {
      id: 'reports-year',
      label: 'Reports 2026–2027',
      startsOn: '2026-01-01',
      endsOn: '2027-12-31',
      active: true,
      lifecycleState: 'active',
    },
  ],
  studentRecords: [
    {
      id: 'reports-alice',
      name: 'Alice Chen',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'reports-ben',
      name: 'Ben Lee',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  learnerContexts: [
    {
      id: 'reports-class',
      kind: 'class',
      name: 'Grade 4 Reading',
      schoolYearId: 'reports-year',
      status: 'active',
    },
  ],
  rosterMemberships: [],
  standards: [
    {
      id: 'reports-standard',
      issuingOrganization: 'Synthetic Standards Office',
      frameworkTitle: 'Synthetic ELA Framework',
      frameworkKey: 'synthetic::ela',
      code: 'ELA.4.R.1',
      normalizedCode: 'ela.4.r.1',
      statement: 'Use details and context to understand a text.',
      sortOrder: 0,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  lessonPlans: [
    {
      id: 'reports-plan',
      contextId: 'reports-class',
      title: 'Reading Workshop',
      subject: 'English Language Arts',
      workflowState: 'ready',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  sessionOccurrences: [
    {
      id: 'reports-session',
      lessonPlanId: 'reports-plan',
      contextId: 'reports-class',
      date: '2026-08-05',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'completed',
      completedAt: timestamp,
    },
  ],
  libraryItems: [
    {
      id: 'reports-assessment',
      catalogType: 'assessment',
      title: 'Reading Check',
      tags: [],
      typedFields: { catalogType: 'assessment', assessmentKind: 'formative' },
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  assessmentEvidence: [
    {
      id: 'reports-score',
      studentId: 'reports-alice',
      schoolYearId: 'reports-year',
      occurredOn: '2026-08-05',
      title: 'Reading check score',
      kind: 'score',
      score: { value: 3, maximum: 4 },
      contextId: 'reports-class',
      lessonPlanId: 'reports-plan',
      sessionOccurrenceId: 'reports-session',
      assessmentId: 'reports-assessment',
      standardIds: ['reports-standard'],
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'reports-observation',
      studentId: 'reports-alice',
      schoolYearId: 'reports-year',
      occurredOn: '2026-08-03',
      title: 'Vocabulary conference',
      kind: 'observation',
      observation: { text: 'Used context clues independently, then explained why.' },
      notes: 'Teacher note with a comma, preserved in CSV.',
      contextId: 'reports-deleted-group',
      standardIds: ['reports-deleted-standard'],
      sourceSnapshots: {
        context: { kind: 'group', name: 'Historical vocabulary group' },
        standards: [
          {
            standardId: 'reports-deleted-standard',
            code: 'VOC.2',
            statement: 'Use vocabulary in context.',
          },
        ],
      },
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'reports-archived',
      studentId: 'reports-alice',
      schoolYearId: 'reports-year',
      occurredOn: '2026-08-01',
      title: 'Archived proficiency',
      kind: 'proficiency',
      proficiency: { label: 'Developing', scaleKey: 'reading', scaleLabel: 'Reading continuum' },
      standardIds: [],
      status: 'archived',
      archivedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'reports-ben-score',
      studentId: 'reports-ben',
      schoolYearId: 'reports-year',
      occurredOn: '2026-08-05',
      title: 'Ben reading score',
      kind: 'score',
      score: { value: 4, maximum: 4 },
      standardIds: [],
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
};

async function waitForSchema(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 17,
    );
  });
}

async function seedReports(page: Page): Promise<void> {
  await page.goto('./#/reports');
  await waitForSchema(page);
  await page.evaluate(async (seedRecords) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const storeNames = Object.keys(seedRecords);
        const transaction = database.transaction(storeNames, 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        for (const [storeName, values] of Object.entries(seedRecords)) {
          const store = transaction.objectStore(storeName);
          store.clear();
          for (const value of values) store.put(value);
        }
      });
    } finally {
      database.close();
    }
  }, records);

  await page.goto('./#/reports?schoolYear=reports-year');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
}

test('Reports produces a learner-specific Evidence preview, CSV, and print representation without inferred judgment', async ({
  page,
}) => {
  await seedReports(page);

  await expect(page.getByText('Teacher Internal · recorded Evidence only')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Choose one learner to preview the report' }),
  ).toBeVisible();

  await page
    .locator('select')
    .filter({ has: page.locator('option[value="reports-alice"]') })
    .selectOption('reports-alice');
  await expect(page).toHaveURL(/student=reports-alice/);
  const report = page.getByRole('article', { name: 'Alice Chen' });
  await expect(report).toBeVisible();
  await expect(report.getByText('Reading check score')).toBeVisible();
  await expect(report.getByText('Vocabulary conference')).toBeVisible();
  await expect(report.getByText('Archived proficiency')).toHaveCount(0);
  await expect(report.getByText('Historical snapshot').first()).toBeVisible();
  await expect(report.getByText('2', { exact: true }).first()).toBeVisible();
  await expect(report).toContainText('Classroom does not infer mastery, grades, readiness');
  await expect(report).not.toContainText('Ben reading score');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    'Classroom-Learner-Evidence-Alice-Chen-Reports-2026-2027.csv',
  );
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = await readFile(path!, 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('Reading check score');
  expect(csv).toContain('Vocabulary conference');
  expect(csv).toContain('Historical vocabulary group');
  expect(csv).toContain('Historical snapshot');
  expect(csv).not.toContain('Ben reading score');

  await page.getByLabel('Evidence status').selectOption('all');
  await expect(report.getByText('Archived proficiency')).toBeVisible();
  await page.getByLabel('Evidence kind').selectOption('observation');
  await expect(report.getByText('Vocabulary conference')).toBeVisible();
  await expect(report.getByText('Reading check score')).toHaveCount(0);
  await expect(report.getByText('Archived proficiency')).toHaveCount(0);

  await page.getByLabel('Evidence kind').selectOption('all');
  await page.getByLabel('Evidence status').selectOption('active');
  await page.getByLabel('Period').selectOption('custom');
  await page.getByLabel('From', { exact: true }).fill('2026-08-05');
  await page.getByLabel('To', { exact: true }).fill('2026-08-05');
  await page.getByRole('button', { name: 'Apply range' }).click();
  await expect(report.getByText('Reading check score')).toBeVisible();
  await expect(report.getByText('Vocabulary conference')).toHaveCount(0);

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('complementary', { name: 'Primary navigation' })).toBeHidden();
  await expect(report).toBeVisible();
});

test('Learner Progress opens the matching report scope and Reports stays mobile-contained and axe-clean', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedReports(page);

  await page.goto(
    './#/learner-progress?schoolYear=reports-year&student=reports-alice&period=custom&from=2026-08-03&to=2026-08-05&kind=score',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Learner Progress' })).toBeVisible();
  const reportLink = page.getByRole('link', { name: 'Open report' });
  await expect(reportLink).toHaveAttribute('href', /#\/reports\?/);
  await reportLink.click();

  await expect(page).toHaveURL(/reports/);
  await expect(page).toHaveURL(/student=reports-alice/);
  await expect(page).toHaveURL(/period=custom/);
  await expect(page).toHaveURL(/kind=score/);
  await expect(page.getByRole('article', { name: 'Alice Chen' })).toContainText(
    'Reading check score',
  );

  await page.getByRole('button', { name: 'Open navigation' }).click();
  const navigation = page.getByRole('complementary', { name: 'Primary navigation' });
  await expect(navigation.getByRole('button', { name: 'Reflect' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(navigation.getByRole('link', { name: 'Reports', exact: true })).toBeVisible();
  await navigation.getByRole('button', { name: 'Settings & Data' }).click();
  await expect(
    navigation.getByRole('link', { name: 'Backup & Recovery', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Close navigation' }).click();
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
