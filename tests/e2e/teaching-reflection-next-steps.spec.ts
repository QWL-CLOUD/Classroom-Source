import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const timestamp = '2026-08-05T12:00:00.000Z';

function reflectionRecords(includeReflection: boolean) {
  return {
    schoolYears: [
      {
        id: 'reflection-year',
        label: 'Reflection 2026–2027',
        startsOn: '2026-01-01',
        endsOn: '2027-12-31',
        active: true,
        lifecycleState: 'active',
      },
    ],
    learnerContexts: [
      {
        id: 'reflection-context',
        kind: 'class',
        name: 'Guided Reading Class',
        schoolYearId: 'reflection-year',
        status: 'active',
      },
    ],
    studentRecords: [
      {
        id: 'reflection-student',
        name: 'Maya Chen',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    lessonPlans: [
      {
        id: 'reflection-plan',
        contextId: 'reflection-context',
        title: 'Guided Reading Lesson',
        subject: 'English Language Arts',
        workflowState: 'ready',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    sessionOccurrences: [
      {
        id: 'reflection-session',
        lessonPlanId: 'reflection-plan',
        contextId: 'reflection-context',
        date: '2026-08-05',
        startMinute: 540,
        endMinute: 600,
        deliveryState: 'completed',
        completedAt: timestamp,
        ...(includeReflection ? { reflectionId: 'reflection-record' } : {}),
      },
    ],
    teachingReflections: includeReflection
      ? [
          {
            id: 'reflection-record',
            sessionOccurrenceId: 'reflection-session',
            schoolYearId: 'reflection-year',
            contextId: 'reflection-context',
            lessonPlanId: 'reflection-plan',
            occurredOn: '2026-08-05',
            whatWorked: 'Students used the visual prompt before reading independently.',
            whatToAdjust: 'Shorten the partner discussion before the final check.',
            sourceSnapshots: {
              context: { kind: 'class', name: 'Guided Reading Class' },
              lessonPlan: { title: 'Guided Reading Lesson' },
              sessionOccurrence: { date: '2026-08-05', startMinute: 540, endMinute: 600 },
            },
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ]
      : [],
    assessmentEvidence: [
      {
        id: 'reflection-evidence',
        studentId: 'reflection-student',
        schoolYearId: 'reflection-year',
        occurredOn: '2026-08-05',
        title: 'Reading strategy observation',
        kind: 'observation',
        observation: { text: 'Used the visual prompt without teacher assistance.' },
        contextId: 'reflection-context',
        lessonPlanId: 'reflection-plan',
        sessionOccurrenceId: 'reflection-session',
        standardIds: [],
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    tasks: includeReflection
      ? [
          {
            id: 'reflection-task',
            title: 'Prepare visual model',
            notes: 'Use a larger visual before the next guided reading Session.',
            status: 'active',
            scheduledDate: '2026-08-06',
            scheduledMinute: 540,
            dueDate: '2026-08-07',
            dueMinute: 900,
            contextId: 'reflection-context',
            linkedEntityType: 'teaching-reflection',
            linkedEntityId: 'reflection-record',
            order: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ]
      : [],
    categoryValues: [],
    categoryAssignments: [],
    changeLog: [],
  };
}

async function waitForSchema(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 17,
    );
  });
}

async function seedReflectionWorkspace(page: Page, includeReflection = false): Promise<void> {
  await page.goto('./#/planning/session?session=reflection-session&return=learners');
  await waitForSchema(page);
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
          store.clear();
          for (const value of values) store.put(value);
        }
      });
    } finally {
      database.close();
    }
  }, reflectionRecords(includeReflection));

  await page.goto('./#/planning/session?session=reflection-session&return=learners');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Session' })).toBeVisible();
}

function nextStepCard(page: Page, status: string) {
  return page.getByRole('article', { name: `Prepare visual model, ${status}` });
}

test('a completed Session creates a source-linked Reflection and reuses the Task lifecycle for Next Steps', async ({
  page,
}) => {
  await seedReflectionWorkspace(page);

  const sessionReflection = page.getByRole('region', {
    name: 'Teaching Reflection',
    exact: true,
  });
  await expect(sessionReflection).toContainText(
    'This completed Session is ready for an optional Teaching Reflection.',
  );
  await sessionReflection.getByRole('link', { name: 'Add reflection' }).click();

  await expect(page).toHaveURL(/planning\/session\/reflection\?session=reflection-session/);
  await expect(page.getByRole('heading', { level: 1, name: 'Teaching Reflection' })).toBeVisible();
  await expect(page.getByText('New Reflection', { exact: true })).toBeVisible();
  await page.getByLabel('What worked?').fill('Students used the visual prompt independently.');
  await page
    .getByLabel('What would you adjust?')
    .fill('Shorten partner discussion and model one example first.');
  await page.getByRole('button', { name: 'Add reflection', exact: true }).click();

  await expect(page.getByText('Active Reflection', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save reflection' })).toBeVisible();

  const evidence = page.getByRole('region', { name: 'Assessment Evidence', exact: true });
  await expect(evidence.getByText('Reading strategy observation', { exact: true })).toBeVisible();
  await expect(evidence.getByText('Maya Chen', { exact: true })).toBeVisible();
  await expect(
    evidence.getByText('Used the visual prompt without teacher assistance.'),
  ).toBeVisible();

  const nextSteps = page.getByRole('region', { name: 'Next Step Tasks', exact: true });
  await nextSteps.getByRole('button', { name: 'Add Next Step', exact: true }).click();
  await page.getByLabel('Next Step title').fill('Prepare visual model');
  await page
    .getByLabel('Notes', { exact: true })
    .fill('Use a larger visual before the next guided reading Session.');

  const scheduled = page.getByRole('group', { name: 'Scheduled', exact: true });
  await scheduled.getByLabel('Date').fill('2026-08-06');
  await scheduled.getByLabel('Time').fill('09:00');
  const due = page.getByRole('group', { name: 'Due', exact: true });
  await due.getByLabel('Date').fill('2026-08-07');
  await due.getByLabel('Time').fill('15:00');
  await nextSteps.getByRole('button', { name: 'Add Next Step', exact: true }).click();

  await expect(nextStepCard(page, 'Active')).toContainText('Scheduled Aug 6 at 9:00 AM');
  await expect(nextStepCard(page, 'Active')).toContainText('Due Aug 7 at 3:00 PM');

  await nextStepCard(page, 'Active').getByRole('button', { name: 'Move to Waiting' }).click();
  await expect(nextStepCard(page, 'Waiting')).toBeVisible();
  await nextStepCard(page, 'Waiting').getByRole('button', { name: 'Restore to Active' }).click();
  await expect(nextStepCard(page, 'Active')).toBeVisible();
  await nextStepCard(page, 'Active').getByRole('button', { name: 'Complete' }).click();
  await expect(nextStepCard(page, 'Completed')).toBeVisible();
  await nextStepCard(page, 'Completed').getByRole('button', { name: 'Reopen task' }).click();
  await expect(nextStepCard(page, 'Active')).toBeVisible();
  await nextStepCard(page, 'Active').getByRole('button', { name: 'Cancel task' }).click();
  await expect(nextStepCard(page, 'Cancelled')).toBeVisible();
  await nextStepCard(page, 'Cancelled').getByRole('button', { name: 'Restore to Active' }).click();
  await expect(nextStepCard(page, 'Active')).toBeVisible();

  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Archive reflection' }).click();
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Confirm archive' }).click();
  await expect(page.getByText('Archived Reflection', { exact: true })).toBeVisible();
  await expect(
    nextSteps.getByRole('button', { name: 'Add Next Step', exact: true }),
  ).toBeDisabled();
  await expect(nextStepCard(page, 'Active')).toBeVisible();

  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore reflection' }).click();
  await expect(page.getByText('Active Reflection', { exact: true })).toBeVisible();

  await nextSteps.getByRole('link', { name: 'Open in Tasks' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible();
  const task = page.getByRole('article', { name: 'Prepare visual model task' });
  await expect(task.getByText('Reflection Next Step', { exact: true })).toBeVisible();
  await expect(task).toContainText('From Teaching Reflection: Guided Reading Lesson');

  await page.goto('./#/planning/session?session=reflection-session&return=learners');
  await expect(
    page
      .getByRole('region', { name: 'Teaching Reflection', exact: true })
      .getByRole('link', { name: 'View reflection' }),
  ).toBeVisible();
});

test('Teaching Reflection remains responsive, keyboard reachable, and axe-clean at 390px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedReflectionWorkspace(page, true);
  await page.goto('./#/planning/session/reflection?session=reflection-session&return=learners');

  await expect(page.getByRole('heading', { level: 1, name: 'Teaching Reflection' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  const whatWorked = page.getByLabel('What worked?');
  await whatWorked.focus();
  await expect(whatWorked).toBeFocused();
  await expect(page.getByRole('article', { name: 'Prepare visual model, Active' })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations,
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});
