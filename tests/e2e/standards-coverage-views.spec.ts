import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const timestamp = '2026-07-26T12:00:00.000Z';

const records = {
  standards: [
    {
      id: 'coverage-standard-math',
      issuingOrganization: 'Synthetic Standards Office',
      frameworkTitle: 'Synthetic Math Framework',
      jurisdiction: 'Local scope',
      version: '2026',
      frameworkKey: 'synthetic standards office|synthetic math framework|local scope|2026',
      code: '3.NF.A.1',
      normalizedCode: '3.nf.a.1',
      statement: 'Explain fractions as quantities.',
      subject: 'Mathematics',
      gradeBand: '3',
      sortOrder: 0,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'coverage-standard-science',
      issuingOrganization: 'Synthetic Standards Office',
      frameworkTitle: 'Synthetic Science Framework',
      jurisdiction: 'Local scope',
      version: '2026',
      frameworkKey: 'synthetic standards office|synthetic science framework|local scope|2026',
      code: '3.PS.1',
      normalizedCode: '3.ps.1',
      statement: 'Use evidence to describe motion.',
      subject: 'Science',
      gradeBand: '3',
      sortOrder: 0,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'coverage-standard-open',
      issuingOrganization: 'Synthetic Standards Office',
      frameworkTitle: 'Synthetic Math Framework',
      jurisdiction: 'Local scope',
      version: '2026',
      frameworkKey: 'synthetic standards office|synthetic math framework|local scope|2026',
      code: '3.NF.A.2',
      normalizedCode: '3.nf.a.2',
      statement: 'Represent fractions on a number line.',
      subject: 'Mathematics',
      sortOrder: 1,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'coverage-standard-archived',
      issuingOrganization: 'Synthetic Standards Office',
      frameworkTitle: 'Synthetic Math Framework',
      jurisdiction: 'Local scope',
      version: '2026',
      frameworkKey: 'synthetic standards office|synthetic math framework|local scope|2026',
      code: '3.NF.OLD',
      normalizedCode: '3.nf.old',
      statement: 'Archived statement.',
      subject: 'Mathematics',
      gradeBand: '3',
      sortOrder: 2,
      status: 'archived',
      archivedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  lessonPlans: [
    {
      id: 'coverage-plan',
      contextId: 'coverage-context',
      title: 'Aligned fractions plan',
      subject: 'Mathematics',
      workflowState: 'ready',
      lessonFlow: [
        {
          id: 'coverage-plan-step-aligned',
          title: 'Model unit fractions',
          phase: 'instruction',
        },
        {
          id: 'coverage-plan-step-open',
          title: 'Fraction exit reflection',
          phase: 'closure',
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'coverage-plan-open',
      contextId: 'coverage-context',
      title: 'Unaligned geometry plan',
      subject: 'Mathematics',
      workflowState: 'draft',
      lessonFlow: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'coverage-plan-archived',
      contextId: 'coverage-context',
      title: 'Archived plan',
      subject: 'Mathematics',
      workflowState: 'archived',
      lessonFlow: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  lessonTemplates: [
    {
      id: 'coverage-template',
      title: 'Aligned science template',
      subject: 'Science',
      status: 'active',
      lessonFlow: [
        {
          id: 'coverage-template-step-aligned',
          title: 'Observe motion',
          phase: 'guided-practice',
        },
        {
          id: 'coverage-template-step-open',
          title: 'Explain evidence',
          phase: 'closure',
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'coverage-template-open',
      title: 'Unaligned discussion template',
      status: 'active',
      lessonFlow: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'coverage-template-archived',
      title: 'Archived template',
      status: 'archived',
      lessonFlow: [],
      archivedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  standardAlignments: [
    {
      id: 'coverage-alignment-plan',
      standardId: 'coverage-standard-math',
      targetType: 'lesson-plan',
      targetId: 'coverage-plan',
      scopeKey: 'lesson-plan:coverage-plan:root',
      createdAt: timestamp,
    },
    {
      id: 'coverage-alignment-plan-step',
      standardId: 'coverage-standard-math',
      targetType: 'lesson-plan',
      targetId: 'coverage-plan',
      lessonFlowStepId: 'coverage-plan-step-aligned',
      scopeKey: 'lesson-plan:coverage-plan:step:coverage-plan-step-aligned',
      createdAt: timestamp,
    },
    {
      id: 'coverage-alignment-template',
      standardId: 'coverage-standard-science',
      targetType: 'lesson-template',
      targetId: 'coverage-template',
      scopeKey: 'lesson-template:coverage-template:root',
      createdAt: timestamp,
    },
    {
      id: 'coverage-alignment-template-step',
      standardId: 'coverage-standard-science',
      targetType: 'lesson-template',
      targetId: 'coverage-template',
      lessonFlowStepId: 'coverage-template-step-aligned',
      scopeKey: 'lesson-template:coverage-template:step:coverage-template-step-aligned',
      createdAt: timestamp,
    },
    {
      id: 'coverage-alignment-archived-standard',
      standardId: 'coverage-standard-archived',
      targetType: 'lesson-plan',
      targetId: 'coverage-plan',
      scopeKey: 'lesson-plan:coverage-plan:root',
      createdAt: timestamp,
    },
    {
      id: 'coverage-alignment-archived-plan',
      standardId: 'coverage-standard-math',
      targetType: 'lesson-plan',
      targetId: 'coverage-plan-archived',
      scopeKey: 'lesson-plan:coverage-plan-archived:root',
      createdAt: timestamp,
    },
    {
      id: 'coverage-alignment-archived-template',
      standardId: 'coverage-standard-math',
      targetType: 'lesson-template',
      targetId: 'coverage-template-archived',
      scopeKey: 'lesson-template:coverage-template-archived:root',
      createdAt: timestamp,
    },
    {
      id: 'coverage-alignment-stale-step',
      standardId: 'coverage-standard-math',
      targetType: 'lesson-plan',
      targetId: 'coverage-plan',
      lessonFlowStepId: 'removed-step',
      scopeKey: 'lesson-plan:coverage-plan:step:removed-step',
      createdAt: timestamp,
    },
  ],
  sessionOccurrences: [
    {
      id: 'coverage-session-one',
      lessonPlanId: 'coverage-plan',
      contextId: 'coverage-context',
      date: '2026-07-27',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'scheduled',
    },
    {
      id: 'coverage-session-two',
      lessonPlanId: 'coverage-plan',
      contextId: 'coverage-context',
      date: '2026-07-28',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'scheduled',
    },
  ],
};

async function waitForSchema(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 9,
    );
  });
}

async function seed(page: Page): Promise<void> {
  await page.evaluate(async (values: typeof records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const storeNames = Object.keys(values);
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeNames, 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        for (const [storeName, storeValues] of Object.entries(values)) {
          const store = transaction.objectStore(storeName);
          store.clear();
          for (const value of storeValues) store.put(value);
        }
      });
    } finally {
      database.close();
    }
  }, records);
}

async function openCoverage(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Coverage' }).click();
  await expect(page.getByRole('heading', { name: 'Coverage overview' })).toBeVisible();
}

test('Standards coverage counts explicit active sources without duplicating Plan sessions', async ({
  page,
}) => {
  await page.goto('./#/standards');
  await waitForSchema(page);
  await seed(page);
  await page.reload();
  await openCoverage(page);

  const overview = page
    .getByRole('heading', { name: 'Coverage overview' })
    .locator('..')
    .locator('..')
    .locator('..');
  await expect(
    overview.getByText('Active Standards', { exact: true }).locator('..').getByText('3', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    overview.getByText('Standards with coverage', { exact: true }).locator('..').getByText('2', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    overview.getByText('Standards without coverage', { exact: true }).locator('..').getByText('1', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    overview.getByText('Explicit active alignments', { exact: true }).locator('..').getByText('4', {
      exact: true,
    }),
  ).toBeVisible();

  const entitySummary = page
    .getByRole('heading', { name: 'Aligned entity types' })
    .locator('..')
    .locator('..')
    .locator('..');
  await expect(
    entitySummary.getByText('Plans', { exact: true }).locator('..').getByText('1', { exact: true }),
  ).toBeVisible();
  await expect(
    entitySummary
      .getByText('Lesson Flow steps', { exact: true })
      .locator('..')
      .getByText('2', { exact: true }),
  ).toBeVisible();
  await expect(
    entitySummary
      .getByText('Lesson Templates', { exact: true })
      .locator('..')
      .getByText('1', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Session occurrences are not counted again')).toBeVisible();

  const breakdown = page.getByLabel('Scrollable coverage breakdown');
  const mathRow = breakdown.getByRole('row', { name: /Synthetic Math Framework/ });
  const scienceRow = breakdown.getByRole('row', { name: /Synthetic Science Framework/ });
  await expect(mathRow.getByRole('cell').nth(0)).toHaveText('2');
  await expect(mathRow.getByRole('cell').nth(1)).toHaveText('1');
  await expect(mathRow.getByRole('cell').nth(2)).toHaveText('2');
  await expect(scienceRow.getByRole('cell').nth(0)).toHaveText('1');
  await expect(scienceRow.getByRole('cell').nth(1)).toHaveText('1');
  await expect(scienceRow.getByRole('cell').nth(2)).toHaveText('2');

  await page.getByLabel('Group by').selectOption('standard');
  const openStandardRow = breakdown.getByRole('row', { name: /3\.NF\.A\.2/ });
  await expect(openStandardRow).toContainText('0');
  await openStandardRow.getByRole('button', { name: 'Open Standard' }).click();
  await expect(page.getByRole('button', { name: 'Catalog' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('article', { name: '3.NF.A.2 Standard details' })).toBeVisible();

  await openCoverage(page);
  const activeAlignments = page.getByLabel('Scrollable active alignments');
  await expect(activeAlignments.getByRole('row')).toHaveCount(5);
  await expect(
    activeAlignments.getByRole('link', { name: /Aligned fractions plan/ }).first(),
  ).toHaveAttribute('href', '#/planning/edit?plan=coverage-plan&return=learners');
  const templateSourceLink = activeAlignments
    .getByRole('link', { name: /Aligned science template/ })
    .first();
  await expect(templateSourceLink).toHaveAttribute(
    'href',
    '#/templates?template=coverage-template',
  );

  const unaligned = page
    .getByRole('heading', { name: 'Active unaligned sources' })
    .locator('..')
    .locator('..')
    .locator('..');
  await expect(unaligned.getByText('Fraction exit reflection')).toBeVisible();
  await expect(unaligned.getByText('Explain evidence')).toBeVisible();
  await expect(unaligned.getByText('Unaligned geometry plan')).toBeVisible();
  await expect(unaligned.getByText('Unaligned discussion template')).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations,
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);

  await templateSourceLink.click();
  await expect(page).toHaveURL(/#\/templates\?template=coverage-template$/);
  await expect(
    page.getByRole('article', { name: 'Aligned science template lesson template details' }),
  ).toBeVisible();
});

test('Standards coverage remains contained and keyboard reachable on a compact viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/standards');
  await waitForSchema(page);
  await seed(page);
  await page.reload();
  await openCoverage(page);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const breakdown = page.getByLabel('Scrollable coverage breakdown');
  await breakdown.focus();
  await expect(breakdown).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
