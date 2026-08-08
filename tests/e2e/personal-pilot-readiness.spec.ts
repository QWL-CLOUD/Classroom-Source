import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function downloadedJson(download: Download) {
  const path = await download.path();
  expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8')) as Record<string, unknown>;
}

async function waitForSchema(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const request = indexedDB.open('classroom-v20');
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const ready = request.result.version >= 17;
          request.result.close();
          resolve(ready);
        };
      }),
  );
}

async function seedPilotWorkspace(page: Page): Promise<void> {
  await page.goto('./#/settings');
  await expect(page.getByRole('region', { name: 'School year editor' })).toBeVisible();
  await waitForSchema(page);
  await page.evaluate(async () => {
    const timestamp = '2026-08-05T12:00:00.000Z';
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          [
            'schoolYears',
            'learnerContexts',
            'studentRecords',
            'rosterMemberships',
            'lessonPlans',
            'sessionOccurrences',
            'teachingReflections',
            'assessmentEvidence',
            'tasks',
          ],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        const schoolYears = transaction.objectStore('schoolYears');
        const contexts = transaction.objectStore('learnerContexts');
        const students = transaction.objectStore('studentRecords');
        const memberships = transaction.objectStore('rosterMemberships');
        const plans = transaction.objectStore('lessonPlans');
        const sessions = transaction.objectStore('sessionOccurrences');
        const reflections = transaction.objectStore('teachingReflections');
        const evidence = transaction.objectStore('assessmentEvidence');
        const tasks = transaction.objectStore('tasks');

        schoolYears.put({
          id: 'pilot-insights-year',
          label: 'Pilot Insights 2026–2027',
          startsOn: '2026-01-01',
          endsOn: '2027-12-31',
          active: true,
          lifecycleState: 'active',
        });
        contexts.put({
          id: 'pilot-reflection-context',
          kind: 'class',
          name: 'Pilot Reflection Class',
          schoolYearId: 'pilot-insights-year',
          status: 'active',
        });
        students.put({
          id: 'pilot-student',
          name: 'Pilot Learner',
          status: 'active',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        memberships.put({
          id: 'pilot-membership',
          contextId: 'pilot-reflection-context',
          studentId: 'pilot-student',
          createdAt: timestamp,
        });

        plans.put({
          id: 'pilot-reflection-plan',
          contextId: 'pilot-reflection-context',
          title: 'Pilot Reflection Lesson',
          subject: 'Reflection smoke test',
          workflowState: 'ready',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        plans.put({
          id: 'pilot-closeout-plan',
          contextId: 'pilot-reflection-context',
          title: 'Pilot Closeout Lesson',
          subject: 'Closeout smoke test',
          workflowState: 'ready',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        plans.put({
          id: 'pilot-review-plan',
          contextId: 'pilot-reflection-context',
          title: 'Pilot Review Lesson',
          subject: 'Review smoke test',
          workflowState: 'ready',
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        sessions.put({
          id: 'pilot-reflection-session',
          lessonPlanId: 'pilot-reflection-plan',
          contextId: 'pilot-reflection-context',
          date: '2026-08-05',
          startMinute: 480,
          endMinute: 535,
          deliveryState: 'completed',
          completedAt: timestamp,
          reflectionId: 'pilot-reflection-record',
        });
        sessions.put({
          id: 'pilot-closeout-session',
          lessonPlanId: 'pilot-closeout-plan',
          contextId: 'pilot-reflection-context',
          date: '2026-08-05',
          startMinute: 540,
          endMinute: 600,
          deliveryState: 'scheduled',
        });
        sessions.put({
          id: 'pilot-review-session',
          lessonPlanId: 'pilot-review-plan',
          contextId: 'pilot-reflection-context',
          date: '2026-08-04',
          startMinute: 600,
          endMinute: 660,
          deliveryState: 'scheduled',
        });

        reflections.put({
          id: 'pilot-reflection-record',
          sessionOccurrenceId: 'pilot-reflection-session',
          schoolYearId: 'pilot-insights-year',
          contextId: 'pilot-reflection-context',
          lessonPlanId: 'pilot-reflection-plan',
          occurredOn: '2026-08-05',
          whatWorked: 'The pilot reflection route remains readable on mobile.',
          sourceSnapshots: {
            context: { kind: 'class', name: 'Pilot Reflection Class' },
            lessonPlan: { title: 'Pilot Reflection Lesson' },
            sessionOccurrence: { date: '2026-08-05', startMinute: 480, endMinute: 535 },
          },
          status: 'active',
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        evidence.put({
          id: 'pilot-closeout-evidence',
          studentId: 'pilot-student',
          schoolYearId: 'pilot-insights-year',
          occurredOn: '2026-08-05',
          title: 'Pilot closeout observation',
          kind: 'observation',
          observation: { text: 'Used the planned strategy independently.' },
          contextId: 'pilot-reflection-context',
          lessonPlanId: 'pilot-closeout-plan',
          sessionOccurrenceId: 'pilot-closeout-session',
          standardIds: [],
          status: 'active',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        evidence.put({
          id: 'pilot-reflection-evidence',
          studentId: 'pilot-student',
          schoolYearId: 'pilot-insights-year',
          occurredOn: '2026-08-05',
          title: 'Pilot reflection score',
          kind: 'score',
          score: { value: 3, maximum: 4 },
          contextId: 'pilot-reflection-context',
          lessonPlanId: 'pilot-reflection-plan',
          sessionOccurrenceId: 'pilot-reflection-session',
          standardIds: [],
          status: 'active',
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        tasks.put({
          id: 'pilot-reflection-task',
          title: 'Prepare next pilot prompt',
          status: 'active',
          contextId: 'pilot-reflection-context',
          linkedEntityType: 'teaching-reflection',
          linkedEntityId: 'pilot-reflection-record',
          order: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      });
    } finally {
      database.close();
    }
  });
}

async function expectNoCriticalAxeViolations(page: Page): Promise<void> {
  const accessibility = await new AxeBuilder({ page }).analyze();
  const critical = accessibility.violations.filter((violation) => violation.impact === 'critical');
  expect(
    critical,
    critical.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
}

test('personal pilot setup persists and produces privacy-safe diagnostics and backup', async ({
  page,
}) => {
  await page.goto('./#/settings');

  const editor = page.getByRole('region', { name: 'School year editor' });
  await expect(editor).toBeVisible();
  await editor.getByLabel('School year name').fill('Pilot 2026–2027');
  await editor.getByLabel('Start date').fill('2026-08-24');
  await editor.getByLabel('End date').fill('2027-06-14');
  await expect(editor.getByLabel('Set as active when created')).toBeChecked();
  await editor.getByRole('button', { name: 'Save school year' }).click();

  await expect(page.getByText('Created Pilot 2026–2027 and set it as active.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('article', { name: 'Pilot 2026–2027 school year' })).toContainText(
    'Active',
  );

  await page.goto('./#/system-health');
  await expect(page.getByRole('heading', { level: 1, name: 'System Health' })).toBeVisible();
  const appVersionCard = page.locator('article').filter({ hasText: 'App version' });
  await expect(appVersionCard.getByText('20.0.0-pilot.1', { exact: true })).toBeVisible();
  await expect(page.getByText('Version 17', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Current v20 record counts' })
      .getByText('Pilot 2026–2027', { exact: true }),
  ).toBeVisible();

  const storageCard = page.locator('article').filter({ hasText: 'Browser storage' });
  await expect(storageCard).not.toContainText('Checking');
  await expect(storageCard).toContainText(/Persistent|Best effort|Unsupported|Unavailable/);

  const diagnosticDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download diagnostic report' }).click();
  const diagnostic = await downloadedJson(await diagnosticDownload);
  const diagnosticText = JSON.stringify(diagnostic);

  expect(diagnostic).toMatchObject({
    format: 'classroom-v20-system-health-v1',
    reportVersion: 1,
    appVersion: '20.0.0-pilot.1',
    database: {
      actualSchemaVersion: 17,
      expectedSchemaVersion: 17,
      ready: true,
    },
    schoolYears: { activeCount: 1 },
    privacy: {
      containsRecordContent: false,
      containsNames: false,
      containsIds: false,
      containsFilePaths: false,
      containsRawImportedData: false,
    },
  });
  expect(Object.keys(diagnostic.portableTableCounts as Record<string, number>)).toHaveLength(33);
  expect(diagnosticText).not.toContain('Pilot 2026–2027');
  expect(diagnosticText).not.toContain('payloadJson');

  await expectNoCriticalAxeViolations(page);

  await page.goto('./#/export');
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full backup' }).click();
  const backup = await downloadedJson(await backupDownload);
  expect(backup).toMatchObject({
    format: 'classroom-v20-backup-v1',
    databaseSchemaVersion: 17,
    appVersion: '20.0.0-pilot.1',
  });
});

test('current personal pilot routes remain mobile-contained and critical-axe-clean', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedPilotWorkspace(page);

  const routes = [
    { path: 'today?date=2026-08-05', heading: /Alyssa\.$/ },
    { path: 'calendar?date=2026-08-05', heading: 'Calendar' },
    { path: 'system-health', heading: 'System Health' },
    {
      path: 'planning/session/reflection?session=pilot-reflection-session&return=learners',
      heading: 'Teaching Reflection',
    },
    { path: 'insights?schoolYear=pilot-insights-year', heading: 'Teaching Insights' },
    { path: 'teaching-review?schoolYear=pilot-insights-year', heading: 'Teaching Review' },
    {
      path: 'learner-progress?schoolYear=pilot-insights-year&student=pilot-student',
      heading: 'Learner Progress',
    },
    {
      path: 'reports?schoolYear=pilot-insights-year&student=pilot-student',
      heading: 'Reports',
    },
  ] as const;

  for (const route of routes) {
    await page.goto(`./#/${route.path}`);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      route.path,
    ).toBe(true);
    await expectNoCriticalAxeViolations(page);
  }

  await expect(page.getByText('Teacher Internal · recorded Evidence only')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Pilot Learner' })).toContainText(
    'Pilot closeout observation',
  );

  const menu = page.getByRole('button', { name: 'Open navigation' });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.getByRole('complementary', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeFocused();
});

test('personal pilot closeout, Evidence review, Reflection, and report export stay connected', async ({
  page,
}) => {
  await seedPilotWorkspace(page);

  await page.goto('./#/planning/session?session=pilot-closeout-session&return=today');
  await expect(page.getByRole('heading', { level: 1, name: 'Session' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark complete' }).click();

  await expect(page).toHaveURL(/planning\/session\?session=pilot-closeout-session&return=today/);
  await expect(
    page.getByText(/Session completed\. Session Evidence and an optional Teaching Reflection/),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Session Evidence' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Learner Progress' })).toBeVisible();
  await expect(page.getByText('Pilot closeout observation', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Session' }).click();

  const reflectionRegion = page.getByRole('region', { name: 'Teaching Reflection', exact: true });
  await reflectionRegion.getByRole('link', { name: 'Add reflection' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Teaching Reflection' })).toBeVisible();
  await page.getByLabel('What worked?').fill('The pilot closeout remained connected end to end.');
  await page.getByRole('button', { name: 'Add reflection', exact: true }).click();
  await expect(page.getByText('Active Reflection', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Return to Today' }).click();
  await expect(page).toHaveURL(/#\/today\?date=2026-08-05/);

  await page.goto('./#/learner-progress?schoolYear=pilot-insights-year&student=pilot-student');
  await expect(page.getByText('Pilot closeout observation', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open report' }).click();
  const report = page.getByRole('article', { name: 'Pilot Learner' });
  await expect(report).toContainText('Pilot closeout observation');
  await expect(report).toContainText('Classroom does not infer mastery, grades, readiness');

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const csvPath = await (await csvDownload).path();
  expect(csvPath).not.toBeNull();
  const csv = await readFile(csvPath!, 'utf8');
  expect(csv).toContain('Pilot closeout observation');
  expect(csv).toContain('Pilot Learner');
});
