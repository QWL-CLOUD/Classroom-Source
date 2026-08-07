import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const timestamp = '2026-08-07T12:00:00.000Z';

const records = {
  schoolYears: [
    {
      id: 'progress-year',
      label: 'Progress 2026–2027',
      startsOn: '2026-01-01',
      endsOn: '2027-12-31',
      active: true,
      lifecycleState: 'active',
    },
  ],
  studentRecords: [
    {
      id: 'progress-alice',
      name: 'Alice Chen',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'progress-ben',
      name: 'Ben Lee',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  learnerContexts: [
    {
      id: 'progress-class',
      kind: 'class',
      name: 'Grade 4 Reading',
      schoolYearId: 'progress-year',
      status: 'active',
    },
  ],
  standards: [
    {
      id: 'progress-standard',
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
      id: 'progress-plan',
      contextId: 'progress-class',
      title: 'Reading Workshop',
      subject: 'English Language Arts',
      workflowState: 'ready',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  sessionOccurrences: [
    {
      id: 'progress-session',
      lessonPlanId: 'progress-plan',
      contextId: 'progress-class',
      date: '2026-08-04',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'completed',
      completedAt: timestamp,
    },
  ],
  libraryItems: [
    {
      id: 'progress-assessment',
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
      id: 'progress-score',
      studentId: 'progress-alice',
      schoolYearId: 'progress-year',
      occurredOn: '2026-08-04',
      title: 'Reading check score',
      kind: 'score',
      score: { value: 3, maximum: 4 },
      contextId: 'progress-class',
      lessonPlanId: 'progress-plan',
      sessionOccurrenceId: 'progress-session',
      assessmentId: 'progress-assessment',
      standardIds: ['progress-standard'],
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'progress-observation',
      studentId: 'progress-alice',
      schoolYearId: 'progress-year',
      occurredOn: '2026-07-20',
      title: 'Vocabulary conference',
      kind: 'observation',
      observation: { text: 'Used context clues independently.' },
      contextId: 'progress-deleted-group',
      standardIds: ['progress-deleted-standard'],
      sourceSnapshots: {
        context: { kind: 'group', name: 'Historical vocabulary group' },
        standards: [
          {
            standardId: 'progress-deleted-standard',
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
      id: 'progress-archived',
      studentId: 'progress-ben',
      schoolYearId: 'progress-year',
      occurredOn: '2026-08-05',
      title: 'Archived proficiency',
      kind: 'proficiency',
      proficiency: {
        label: 'Developing',
        scaleKey: 'reading',
        scaleLabel: 'Reading continuum',
      },
      standardIds: [],
      status: 'archived',
      archivedAt: timestamp,
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

async function seedLearnerProgress(page: Page): Promise<void> {
  await page.goto('./#/learner-progress');
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

  await page.goto('./#/learner-progress?schoolYear=progress-year');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Learner Progress' })).toBeVisible();
}

test('Learner Progress reviews exact recorded Evidence across learner, Context, and Standard views', async ({
  page,
}) => {
  await seedLearnerProgress(page);

  await expect(page.getByText('Recorded Evidence, not a mastery judgment')).toBeVisible();
  await expect(page.getByText('Reading check score')).toBeVisible();
  await expect(page.getByText('Vocabulary conference')).toBeVisible();
  await expect(page.getByText('Archived proficiency')).toHaveCount(0);

  const scopePanel = page.getByRole('complementary', { name: 'Select a source scope' });
  await scopePanel.getByRole('button', { name: /Alice Chen/ }).click();
  await expect(page).toHaveURL(/student=progress-alice/);

  await page.getByRole('button', { name: /Reading check score/ }).click();
  await expect(page).toHaveURL(/evidence=progress-score/);
  const detail = page.getByRole('article', { name: 'Reading check score' });
  await expect(detail.getByText('3 / 4')).toBeVisible();
  await expect(detail.getByRole('link', { name: 'Alice Chen' })).toHaveAttribute(
    'href',
    /#\/learners\?student=progress-alice&return=progress/,
  );
  await expect(detail.getByRole('link', { name: /ELA\.4\.R\.1/ })).toHaveAttribute(
    'href',
    /#\/standards\?standard=progress-standard&return=progress/,
  );

  await page.getByLabel('Period').selectOption('custom');
  await page.getByRole('textbox', { name: 'From', exact: true }).fill('2026-08-03');
  await page.getByRole('textbox', { name: 'To', exact: true }).fill('2026-08-07');
  await page.getByRole('button', { name: 'Apply range' }).click();
  await expect(page.getByText('Reading check score')).toBeVisible();
  await expect(page.getByText('Vocabulary conference')).toHaveCount(0);

  await page.getByRole('button', { name: 'Contexts', exact: true }).click();
  await scopePanel.getByRole('button', { name: /Grade 4 Reading/ }).click();
  await expect(page).toHaveURL(/view=contexts/);
  await expect(page).toHaveURL(/context=progress-class/);
  await expect(page.getByText('Reading check score')).toBeVisible();

  await page.getByRole('button', { name: 'Standards', exact: true }).click();
  await scopePanel.getByRole('button', { name: /ELA\.4\.R\.1/ }).click();
  await expect(page).toHaveURL(/view=standards/);
  await expect(page).toHaveURL(/standard=progress-standard/);
  await expect(page.getByText('Reading check score')).toBeVisible();
});

test('Learner Progress preserves historical source snapshots and stays contained and axe-clean on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLearnerProgress(page);

  await page.getByRole('button', { name: 'Standards', exact: true }).click();
  const scopePanel = page.getByRole('complementary', { name: 'Select a source scope' });
  await scopePanel.getByRole('button', { name: /VOC\.2/ }).click();
  await page.getByRole('button', { name: /Vocabulary conference/ }).click();

  const detail = page.getByRole('article', { name: 'Vocabulary conference' });
  await expect(detail.getByText('Historical snapshot').first()).toBeVisible();
  await expect(detail.getByText(/VOC\.2/)).toBeVisible();
  await expect(detail.getByRole('link', { name: /VOC\.2/ })).toHaveCount(0);

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

test('Learner Progress creates, edits, archives, restores, and returns from exact Evidence sources', async ({
  page,
}) => {
  await seedLearnerProgress(page);

  const scopePanel = page.getByRole('complementary', { name: 'Select a source scope' });
  await scopePanel.getByRole('button', { name: /Alice Chen/ }).click();
  await page.getByRole('button', { name: 'Add Evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Add Evidence' })).toBeVisible();

  await page.getByLabel('Evidence date').fill('2026-08-07');
  await page.getByLabel('Title').fill('Teacher conference note');
  await page.getByLabel('Context · optional').selectOption('progress-class');
  await page.getByLabel('Lesson Plan · optional').selectOption('progress-plan');
  await page.getByLabel('Session · optional').selectOption('progress-session');
  await page.getByLabel('Library Assessment · optional').selectOption('progress-assessment');
  await page.getByLabel('Linked Standards').selectOption('progress-standard');
  await page.getByLabel('Teacher observation').fill('Explained the strategy with text evidence.');
  await page.getByRole('button', { name: 'Add Evidence' }).last().click();

  await expect(
    page.getByRole('region', { name: 'Learner Progress' }).getByRole('status'),
  ).toContainText('Evidence saved');
  await expect(
    page.getByRole('heading', { name: 'Teacher conference note', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/evidence=/);
  const createdDetail = page.getByRole('article', { name: 'Teacher conference note' });
  await expect(createdDetail).toBeVisible();

  await createdDetail.getByRole('button', { name: 'Edit Evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Evidence' })).toBeVisible();
  await page.getByLabel('Title').fill('Teacher conference observation');
  await page.getByRole('button', { name: 'Save Evidence' }).click();
  await expect(
    page.getByRole('heading', { name: 'Teacher conference observation', exact: true }),
  ).toBeVisible();

  const updatedDetail = page.getByRole('article', { name: 'Teacher conference observation' });
  await updatedDetail.getByRole('button', { name: 'Archive Evidence' }).click();
  await expect(
    page.getByRole('region', { name: 'Learner Progress' }).getByRole('status'),
  ).toContainText('Evidence archived');
  await expect(
    page.getByRole('article', { name: 'Teacher conference observation' }).getByText('Archived'),
  ).toBeVisible();

  await page
    .getByRole('article', { name: 'Teacher conference observation' })
    .getByRole('button', { name: 'Restore Evidence' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Learner Progress' }).getByRole('status'),
  ).toContainText('Evidence restored');

  const learnerLink = page
    .getByRole('article', { name: 'Teacher conference observation' })
    .getByRole('link', { name: 'Alice Chen' });
  await learnerLink.click();
  await expect(page.getByRole('link', { name: 'Back to Learner Progress' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Learner Progress' }).click();
  await expect(page.getByRole('article', { name: 'Teacher conference observation' })).toBeVisible();
});
