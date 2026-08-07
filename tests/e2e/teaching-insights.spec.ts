import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const timestamp = '2026-08-05T12:00:00.000Z';

const records = {
  schoolYears: [
    {
      id: 'insights-current-year',
      label: 'Insights 2026–2027',
      startsOn: '2026-01-01',
      endsOn: '2027-12-31',
      active: true,
      lifecycleState: 'active',
    },
    {
      id: 'insights-historical-year',
      label: 'Insights 2025',
      startsOn: '2025-01-01',
      endsOn: '2025-12-31',
      active: false,
      lifecycleState: 'archived',
      archivedAt: timestamp,
    },
  ],
  learnerContexts: [
    {
      id: 'insights-class',
      kind: 'class',
      name: 'Grade 4 Reading',
      schoolYearId: 'insights-current-year',
      status: 'active',
    },
    {
      id: 'insights-group',
      kind: 'group',
      name: 'Vocabulary Group',
      schoolYearId: 'insights-current-year',
      status: 'archived',
    },
    {
      id: 'insights-individual',
      kind: 'individual',
      name: 'Alice one-on-one',
      schoolYearId: 'insights-current-year',
      status: 'active',
      linkedStudentId: 'insights-student-alice',
    },
  ],
  studentRecords: [
    {
      id: 'insights-student-alice',
      name: 'Alice Chen',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'insights-student-ben',
      name: 'Ben Lee',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  rosterMemberships: [
    {
      id: 'insights-membership-class-alice',
      contextId: 'insights-class',
      studentId: 'insights-student-alice',
      createdAt: timestamp,
    },
    {
      id: 'insights-membership-group-alice',
      contextId: 'insights-group',
      studentId: 'insights-student-alice',
      createdAt: timestamp,
    },
    {
      id: 'insights-membership-class-ben',
      contextId: 'insights-class',
      studentId: 'insights-student-ben',
      createdAt: timestamp,
    },
  ],
  lessonPlans: [
    {
      id: 'insights-plan-reading',
      contextId: 'insights-class',
      title: 'Reading Workshop',
      subject: 'English Language Arts',
      workflowState: 'ready',
      libraryLinks: [
        { libraryItemId: 'insights-activity', catalogType: 'activity' },
        { libraryItemId: 'insights-resource', catalogType: 'resource' },
      ],
      lessonFlow: [
        {
          id: 'insights-reading-check',
          title: 'Reading check',
          phase: 'assessment',
          libraryLinks: [{ libraryItemId: 'insights-assessment', catalogType: 'assessment' }],
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'insights-plan-vocabulary',
      contextId: 'insights-group',
      title: 'Vocabulary Practice',
      subject: 'English Language Arts',
      workflowState: 'ready',
      lessonFlow: [
        {
          id: 'insights-vocabulary-step',
          title: 'Use words in context',
          phase: 'guided-practice',
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'insights-plan-ready',
      contextId: 'insights-individual',
      title: 'Individual Reading Conference',
      subject: 'English Language Arts',
      workflowState: 'ready',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  sessionOccurrences: [
    {
      id: 'insights-session-reading',
      lessonPlanId: 'insights-plan-reading',
      contextId: 'insights-class',
      date: '2026-08-03',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'completed',
      completedAt: timestamp,
      reflectionId: 'insights-reflection-reading',
    },
    {
      id: 'insights-session-vocabulary',
      lessonPlanId: 'insights-plan-vocabulary',
      contextId: 'insights-group',
      date: '2026-08-04',
      startMinute: 600,
      endMinute: 630,
      deliveryState: 'completed',
      completedAt: timestamp,
      reflectionId: 'insights-reflection-vocabulary',
    },
    {
      id: 'insights-session-past-scheduled',
      lessonPlanId: 'insights-plan-reading',
      contextId: 'insights-class',
      date: '2026-08-02',
      startMinute: 600,
      endMinute: 660,
      deliveryState: 'scheduled',
    },
    {
      id: 'insights-session-future',
      lessonPlanId: 'insights-plan-vocabulary',
      contextId: 'insights-group',
      date: '2027-06-01',
      startMinute: 600,
      endMinute: 630,
      deliveryState: 'scheduled',
    },
    {
      id: 'insights-session-cancelled',
      lessonPlanId: 'insights-plan-reading',
      contextId: 'insights-class',
      date: '2026-08-01',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'cancelled',
    },
  ],
  teachingReflections: [
    {
      id: 'insights-reflection-reading',
      sessionOccurrenceId: 'insights-session-reading',
      schoolYearId: 'insights-current-year',
      contextId: 'insights-class',
      lessonPlanId: 'insights-plan-reading',
      occurredOn: '2026-08-03',
      whatWorked: 'Students used context clues independently.',
      whatToAdjust: 'Shorten partner practice before the reading check.',
      sourceSnapshots: {
        context: { kind: 'class', name: 'Grade 4 Reading' },
        lessonPlan: { title: 'Reading Workshop' },
        sessionOccurrence: { date: '2026-08-03', startMinute: 540, endMinute: 600 },
      },
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'insights-reflection-vocabulary',
      sessionOccurrenceId: 'insights-session-vocabulary',
      schoolYearId: 'insights-current-year',
      contextId: 'insights-group',
      lessonPlanId: 'insights-plan-vocabulary',
      occurredOn: '2026-08-04',
      additionalNotes: 'Archived historical teaching note.',
      sourceSnapshots: {
        context: { kind: 'group', name: 'Vocabulary Group' },
        lessonPlan: { title: 'Vocabulary Practice' },
        sessionOccurrence: { date: '2026-08-04', startMinute: 600, endMinute: 630 },
      },
      status: 'archived',
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: timestamp,
    },
  ],
  tasks: [
    {
      id: 'insights-next-step-active',
      title: 'Prepare a shorter partner routine',
      status: 'active',
      contextId: 'insights-class',
      linkedEntityType: 'teaching-reflection',
      linkedEntityId: 'insights-reflection-reading',
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'insights-next-step-waiting',
      title: 'Request a new reading passage',
      status: 'waiting',
      contextId: 'insights-class',
      linkedEntityType: 'teaching-reflection',
      linkedEntityId: 'insights-reflection-reading',
      order: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      waitingAt: timestamp,
    },
    {
      id: 'insights-next-step-completed',
      title: 'Print vocabulary cards',
      status: 'completed',
      contextId: 'insights-group',
      linkedEntityType: 'teaching-reflection',
      linkedEntityId: 'insights-reflection-vocabulary',
      order: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: timestamp,
    },
    {
      id: 'insights-next-step-cancelled',
      title: 'Replace the archived activity',
      status: 'cancelled',
      contextId: 'insights-group',
      linkedEntityType: 'teaching-reflection',
      linkedEntityId: 'insights-reflection-vocabulary',
      order: 3,
      createdAt: timestamp,
      updatedAt: timestamp,
      cancelledAt: timestamp,
    },
  ],
  assessmentEvidence: [
    {
      id: 'insights-evidence-observation',
      studentId: 'insights-student-alice',
      schoolYearId: 'insights-current-year',
      occurredOn: '2026-08-03',
      title: 'Reading observation',
      kind: 'observation',
      observation: { text: 'Used context clues.' },
      contextId: 'insights-class',
      lessonPlanId: 'insights-plan-reading',
      sessionOccurrenceId: 'insights-session-reading',
      assessmentId: 'insights-assessment',
      standardIds: ['insights-standard'],
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'insights-evidence-score',
      studentId: 'insights-student-alice',
      schoolYearId: 'insights-current-year',
      occurredOn: '2026-08-04',
      title: 'Vocabulary check',
      kind: 'score',
      score: { value: 8, maximum: 10 },
      standardIds: [],
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  libraryItems: [
    {
      id: 'insights-activity',
      catalogType: 'activity',
      title: 'Context Clue Sort',
      tags: [],
      typedFields: { catalogType: 'activity', grouping: 'partners' },
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'insights-resource',
      catalogType: 'resource',
      title: 'Reading Passage',
      tags: [],
      typedFields: { catalogType: 'resource' },
      status: 'archived',
      archivedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'insights-assessment',
      catalogType: 'assessment',
      title: 'Reading Check',
      tags: [],
      typedFields: { catalogType: 'assessment', assessmentKind: 'formative' },
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  standards: [
    {
      id: 'insights-standard',
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
  standardAlignments: [
    {
      id: 'insights-alignment-reading',
      standardId: 'insights-standard',
      targetType: 'lesson-plan',
      targetId: 'insights-plan-reading',
      scopeKey: 'lesson-plan:insights-plan-reading:root',
      createdAt: timestamp,
    },
    {
      id: 'insights-alignment-vocabulary',
      standardId: 'insights-standard',
      targetType: 'lesson-plan',
      targetId: 'insights-plan-vocabulary',
      lessonFlowStepId: 'insights-vocabulary-step',
      scopeKey: 'lesson-plan:insights-plan-vocabulary:step:insights-vocabulary-step',
      createdAt: timestamp,
    },
  ],
  categoryValues: [
    {
      id: 'insights-focus-value',
      familyId: 'focus-tag',
      name: 'Reading comprehension',
      normalizedName: 'reading comprehension',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  categoryAssignments: [
    {
      id: 'insights-focus-assignment',
      familyId: 'focus-tag',
      categoryValueId: 'insights-focus-value',
      entityType: 'lesson-plan',
      entityId: 'insights-plan-reading',
      createdAt: timestamp,
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

async function seedInsights(page: Page): Promise<void> {
  await page.goto('./#/insights');
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

  await page.goto('./#/insights?schoolYear=insights-current-year');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Teaching Insights' })).toBeVisible();
}

function metricCard(scope: Locator, label: string): Locator {
  return scope.locator('article').filter({ hasText: label }).first();
}

function definition(section: Locator, label: string): Locator {
  return section.locator('dt').filter({ hasText: label }).first().locator('..');
}

test('Teaching Insights reports source-linked first-release metrics without unsupported inference', async ({
  page,
}) => {
  await seedInsights(page);

  const teachingActivity = page.getByRole('region', {
    name: 'Completed teaching records',
    exact: true,
  });
  await expect(metricCard(teachingActivity, 'Completed Sessions')).toContainText('2');
  await expect(metricCard(teachingActivity, 'Completed Teaching Minutes')).toContainText('90');
  await expect(metricCard(teachingActivity, 'Teaching Days')).toContainText('2');

  const planned = page.getByRole('region', { name: 'Session-based completion', exact: true });
  await expect(planned.getByText('67%', { exact: true })).toBeVisible();
  await expect(definition(planned, 'Past planned')).toContainText('3');
  await expect(definition(planned, 'Taught')).toContainText('2');
  await expect(definition(planned, 'Past still Scheduled')).toContainText('1');
  await expect(definition(planned, 'Future Scheduled')).toContainText('1');
  await expect(definition(planned, 'Cancelled')).toContainText('1');
  await expect(definition(planned, 'Ready and unscheduled Plans')).toContainText('1');
  await expect(planned).toContainText('Classroom does not infer that the teaching did not occur.');

  const evidence = page.getByRole('region', {
    name: 'Current retained roster coverage',
    exact: true,
  });
  await expect(evidence.getByText('50%', { exact: true })).toBeVisible();
  await expect(definition(evidence, 'Active Evidence records')).toContainText('2');
  await expect(definition(evidence, 'Learners with Evidence')).toContainText('1');
  await expect(definition(evidence, 'Current retained roster learners')).toContainText('2');
  await expect(definition(evidence, 'Covered roster learners')).toContainText('1');

  const contextDistribution = page.getByRole('region', {
    name: 'Class, Group, and Individual',
  });
  await expect(metricCard(contextDistribution, 'Class')).toContainText('1 Sessions');
  await expect(metricCard(contextDistribution, 'Group')).toContainText('1 Sessions');
  await expect(metricCard(contextDistribution, 'Individual')).toContainText('0 Sessions');
  const contextTable = contextDistribution.getByRole('region', {
    name: 'Teaching activity by planning context',
  });
  await expect(contextTable.getByRole('row', { name: /Grade 4 Reading/ })).toContainText('60');
  await expect(contextTable.getByRole('row', { name: /Vocabulary Group/ })).toContainText(
    'Archived',
  );

  const standards = page.getByRole('region', { name: 'Explicit planning alignment', exact: true });
  await expect(definition(standards, 'Active Plans')).toContainText('3');
  await expect(definition(standards, 'Plans with active alignment')).toContainText('2');
  await expect(definition(standards, 'Plans without active alignment')).toContainText('1');
  await expect(definition(standards, 'Unique linked Standards')).toContainText('1');
  await expect(definition(standards, 'Alignment placements')).toContainText('2');

  const content = page.getByRole('region', { name: 'Planning content links', exact: true });
  await expect(definition(content, 'Plans with links')).toContainText('1');
  await expect(definition(content, 'Unique Library items')).toContainText('3');
  await expect(definition(content, 'Link placements')).toContainText('3');
  await expect(definition(content, 'Archived-source placements')).toContainText('1');

  const classification = page.getByRole('region', {
    name: 'Managed Plan category assignments',
  });
  await expect(metricCard(classification, 'Focus tags')).toContainText('1 assignments');

  const reflection = page.getByRole('region', { name: 'Reflection and Next Steps', exact: true });
  await expect(reflection.getByText('50%', { exact: true })).toBeVisible();
  await expect(definition(reflection, 'Active Reflections')).toContainText('1');
  await expect(definition(reflection, 'Archived Reflections')).toContainText('1');
  await expect(definition(reflection, 'Reflected completed Sessions')).toContainText('1');
  await expect(definition(reflection, 'Completed without active Reflection')).toContainText('1');
  await expect(definition(reflection, 'Open Next Steps')).toContainText('2');
  await expect(definition(reflection, 'Closed Next Steps')).toContainText('2');
  await expect(metricCard(reflection, 'Active')).toContainText('1');
  await expect(metricCard(reflection, 'Waiting')).toContainText('1');
  await expect(metricCard(reflection, 'Completed')).toContainText('1');
  await expect(metricCard(reflection, 'Cancelled')).toContainText('1');
  await expect(reflection).toContainText('does not infer teaching quality');

  const review = page.getByRole('region', { name: 'Needs review', exact: true });
  await expect(metricCard(review, 'Affected records')).toContainText('1');
  await expect(metricCard(review, 'Review issues')).toContainText('1');
  await expect(review.getByText('past-session-still-scheduled', { exact: true })).toBeVisible();

  await teachingActivity.getByText('Completed Session sources (2)', { exact: true }).click();
  const sessionLink = teachingActivity.getByRole('link', { name: 'Reading Workshop' });
  await expect(sessionLink).toHaveAttribute(
    'href',
    '#/planning/session?session=insights-session-reading',
  );

  const classLink = contextTable.getByRole('link', { name: 'Grade 4 Reading' });
  await expect(classLink).toHaveAttribute('href', '#/learners?context=insights-class');

  await standards.getByText('Alignment sources (2)', { exact: true }).click();
  const planLink = standards.getByRole('link', { name: 'Reading Workshop' });
  await expect(planLink).toHaveAttribute(
    'href',
    '#/planning/edit?plan=insights-plan-reading&return=learners',
  );

  await reflection.getByText('Reflection sources (2)', { exact: true }).click();
  const reflectionLink = reflection.getByRole('link', { name: 'Reading Workshop' });
  await expect(reflectionLink).toHaveAttribute(
    'href',
    '#/planning/session/reflection?session=insights-session-reading',
  );

  await sessionLink.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Session' })).toBeVisible();
  await page.goto('./#/insights?schoolYear=insights-current-year');
  await expect(page.getByRole('heading', { level: 1, name: 'Teaching Insights' })).toBeVisible();
  await page
    .getByRole('region', { name: 'Explicit planning alignment', exact: true })
    .getByText('Alignment sources (2)', { exact: true })
    .click();
  await page
    .getByRole('region', { name: 'Explicit planning alignment', exact: true })
    .getByRole('link', { name: 'Reading Workshop' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Edit plan' })).toBeVisible();
});

test('School Year selection is URL-backed and preserves an explicit historical empty state', async ({
  page,
}) => {
  await seedInsights(page);

  const selector = page.getByRole('combobox', { name: 'School Year', exact: true });
  await selector.selectOption('insights-historical-year');
  await expect(page).toHaveURL(/schoolYear=insights-historical-year/);
  await expect(page.getByText('historical', { exact: true })).toBeVisible();
  const activity = page.getByRole('region', {
    name: 'Completed teaching records',
    exact: true,
  });
  await expect(metricCard(activity, 'Completed Sessions')).toContainText('0');
  await expect(page.getByText('Not available', { exact: true }).first()).toBeVisible();

  await page.reload();
  await expect(selector).toHaveValue('insights-historical-year');
  await expect(selector.locator('option:checked')).toHaveText(/Insights 2025/);
});

test('Teaching Insights keeps Standards and Content inside the page at intermediate desktop widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedInsights(page);

  for (const width of [1024, 1180, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    const standards = page.getByRole('region', {
      name: 'Explicit planning alignment',
      exact: true,
    });
    const content = page.getByRole('region', {
      name: 'Planning content links',
      exact: true,
    });

    await expect(standards).toBeVisible();
    await expect(content).toBeVisible();

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    for (const section of [standards, content]) {
      const box = await section.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);

      const dimensions = await section.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }
  }
});

test('Teaching Insights stays responsive, keyboard reachable, and axe-clean at 390px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedInsights(page);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  const contextScroller = page.getByRole('region', {
    name: 'Teaching activity by planning context',
  });
  await contextScroller.focus();
  await expect(contextScroller).toBeFocused();
  const dimensions = await contextScroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations,
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});
