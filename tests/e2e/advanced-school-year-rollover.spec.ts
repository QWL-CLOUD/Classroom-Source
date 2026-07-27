import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function waitForSchema(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('classroom-v20');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        try {
          return database.version >= 10 && database.objectStoreNames.contains('backupSnapshots');
        } finally {
          database.close();
        }
      }),
    )
    .toBe(true);
}

async function seed(page: Page, conflict = false): Promise<void> {
  await waitForSchema(page);
  await page.evaluate(
    async ({ conflict }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('classroom-v20');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const transaction = database.transaction(
        [
          'schoolYears',
          'learnerContexts',
          'contextMemberships',
          'scheduleBlocks',
          'lessonSeries',
          'lessonPlans',
          'sessionOccurrences',
          'standardAlignments',
          'categoryAssignments',
          'backupSnapshots',
          'changeLog',
        ],
        'readwrite',
      );
      const put = (store: string, value: unknown) => transaction.objectStore(store).put(value);
      put('schoolYears', {
        id: 'source-year',
        label: '2026–2027',
        startsOn: '2026-08-24',
        endsOn: '2027-06-18',
        active: true,
        lifecycleState: 'active',
      });
      put('schoolYears', {
        id: 'target-year',
        label: '2027–2028',
        startsOn: '2027-08-23',
        endsOn: '2028-06-16',
        active: false,
        lifecycleState: 'active',
      });
      put('learnerContexts', {
        id: 'source-class',
        kind: 'class',
        name: 'Grade 3',
        schoolYearId: 'source-year',
        status: 'active',
      });
      put('learnerContexts', {
        id: 'source-student',
        kind: 'individual',
        name: 'Student A',
        schoolYearId: 'source-year',
        status: 'active',
      });
      put('contextMemberships', {
        id: 'source-membership',
        containerContextId: 'source-class',
        memberContextId: 'source-student',
      });
      if (conflict) {
        put('learnerContexts', {
          id: 'target-class',
          kind: 'class',
          name: 'Grade 3',
          schoolYearId: 'target-year',
          status: 'active',
        });
      }
      put('lessonSeries', {
        id: 'source-series',
        contextId: 'source-class',
        title: 'Unit 1',
        subject: 'Chinese',
        lifecycleState: 'active',
      });
      put('lessonPlans', {
        id: 'source-plan',
        contextId: 'source-class',
        title: 'Lesson 1',
        subject: 'Chinese',
        workflowState: 'ready',
        seriesId: 'source-series',
        sequence: 0,
        preferredScheduleBlockId: 'source-schedule',
        lessonFlow: [{ id: 'source-step', title: 'Opening', phase: 'opening' }],
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-01T12:00:00.000Z',
      });
      put('sessionOccurrences', {
        id: 'source-session',
        lessonPlanId: 'source-plan',
        contextId: 'source-class',
        date: '2026-09-01',
        startMinute: 540,
        endMinute: 600,
        deliveryState: 'completed',
        completedAt: '2026-09-01T15:00:00.000Z',
      });
      put('scheduleBlocks', {
        id: 'source-schedule',
        contextId: 'source-class',
        title: 'Chinese',
        subject: 'Chinese',
        category: 'Teaching',
        kind: 'teachable',
        weekdays: [1],
        startMinute: 540,
        endMinute: 600,
        effectiveFrom: '2026-08-24',
        effectiveTo: '2027-06-18',
        planningEnabled: true,
        bumpEnabled: true,
        showInWeek: true,
        sortOrder: 0,
      });
      if (conflict) {
        put('scheduleBlocks', {
          id: 'target-conflict',
          contextId: 'target-class',
          title: 'Existing Chinese',
          subject: 'Chinese',
          category: 'Teaching',
          kind: 'teachable',
          weekdays: [1],
          startMinute: 540,
          endMinute: 600,
          effectiveFrom: '2027-08-23',
          effectiveTo: '2028-06-16',
          planningEnabled: true,
          bumpEnabled: true,
          showInWeek: true,
          sortOrder: 0,
        });
      }
      put('standardAlignments', {
        id: 'source-alignment',
        standardId: 'standard-1',
        targetType: 'lesson-plan',
        targetId: 'source-plan',
        lessonFlowStepId: 'source-step',
        scopeKey: 'lesson-plan:source-plan:step:source-step',
        createdAt: '2026-07-01T12:00:00.000Z',
      });
      put('categoryAssignments', {
        id: 'source-category',
        familyId: 'focus-tag',
        categoryValueId: 'focus-value',
        entityType: 'lesson-plan',
        entityId: 'source-plan',
        createdAt: '2026-07-01T12:00:00.000Z',
      });

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { conflict },
  );
}

async function readState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction(
      [
        'schoolYears',
        'learnerContexts',
        'contextMemberships',
        'lessonSeries',
        'lessonPlans',
        'sessionOccurrences',
        'standardAlignments',
        'backupSnapshots',
      ],
      'readonly',
    );
    const read = <T>(store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const request = transaction.objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    const result = {
      schoolYears: await read<{ id: string; startsOn: string; endsOn: string; active: boolean }>(
        'schoolYears',
      ),
      contexts: await read<{ id: string; schoolYearId: string }>('learnerContexts'),
      memberships: await read<{ id: string }>('contextMemberships'),
      series: await read<{ id: string; rolledOverFromSeriesId?: string }>('lessonSeries'),
      plans: await read<{ id: string; rolledOverFromPlanId?: string; workflowState: string }>(
        'lessonPlans',
      ),
      sessions: await read<{ id: string }>('sessionOccurrences'),
      alignments: await read<{ id: string; targetId: string }>('standardAlignments'),
      snapshots: await read<{ id: string; kind: string }>('backupSnapshots'),
    };
    database.close();
    return result;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('./#/settings/rollover');
  await page.evaluate(() => indexedDB.deleteDatabase('classroom-v20'));
  await page.reload();
});

test('Instructional rollover copies reusable plans without changing dates or student history', async ({
  page,
}) => {
  await seed(page);
  await page.reload();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Instructional rollover' }),
  ).toBeVisible();
  await expect(page.getByText('School Year dates are protected')).toBeVisible();
  await page.getByLabel('Lesson 1').check();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  await expect(page.getByRole('heading', { name: 'Instructional rollover preview' })).toBeVisible();
  await expect(page.getByLabel('Instructional rollover summary')).toContainText('1Lesson Plans');
  await expect(
    page
      .getByLabel('Scrollable instructional rollover preview')
      .getByText('Lesson 1', { exact: true }),
  ).toBeVisible();
  await page.getByLabel(/I reviewed the copied Lesson Series/).check();
  await page.getByLabel(/I understand that School Year dates/).check();
  await page.getByRole('button', { name: 'Commit instructional rollover' }).click();

  await expect(
    page.getByRole('heading', { name: 'Instructional rollover committed' }),
  ).toBeVisible();
  await expect
    .poll(() => readState(page))
    .toMatchObject({
      schoolYears: expect.arrayContaining([
        expect.objectContaining({
          id: 'source-year',
          startsOn: '2026-08-24',
          endsOn: '2027-06-18',
          active: true,
        }),
        expect.objectContaining({
          id: 'target-year',
          startsOn: '2027-08-23',
          endsOn: '2028-06-16',
          active: false,
        }),
      ]),
      memberships: [{ id: 'source-membership' }],
      sessions: [{ id: 'source-session' }],
      series: expect.arrayContaining([
        expect.objectContaining({ rolledOverFromSeriesId: 'source-series' }),
      ]),
      plans: expect.arrayContaining([
        expect.objectContaining({ rolledOverFromPlanId: 'source-plan', workflowState: 'draft' }),
      ]),
      snapshots: [expect.objectContaining({ kind: 'pre-rollover' })],
    });

  const undoButton = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undoButton).toBeEnabled();
  await expect(undoButton).toHaveAttribute('title', /Undo Roll over 1 Lesson Plan/);
  await undoButton.click();
  await expect
    .poll(async () => (await readState(page)).plans)
    .toEqual([expect.objectContaining({ id: 'source-plan' })]);
  const afterUndo = await readState(page);
  expect(afterUndo.schoolYears).toEqual([
    expect.objectContaining({
      id: 'source-year',
      startsOn: '2026-08-24',
      endsOn: '2027-06-18',
      active: true,
    }),
    expect.objectContaining({
      id: 'target-year',
      startsOn: '2027-08-23',
      endsOn: '2028-06-16',
      active: false,
    }),
  ]);
  expect(afterUndo.memberships).toEqual([expect.objectContaining({ id: 'source-membership' })]);
  expect(afterUndo.sessions).toEqual([expect.objectContaining({ id: 'source-session' })]);
});

test('Schedule conflicts remain review warnings and compact layout stays contained', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, true);
  await page.reload();

  await page.getByLabel('Lesson 1').check();
  await page.getByLabel(/Copy selected Schedule Blocks/).check();
  await page.getByLabel(/Chinese · Mon/).check();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  await expect(page.getByText(/Schedule conflict/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commit instructional rollover' })).toBeDisabled();
  await page.getByLabel(/I reviewed the copied Lesson Series/).check();
  await page.getByLabel(/I understand that School Year dates/).check();
  await expect(page.getByRole('button', { name: 'Commit instructional rollover' })).toBeEnabled();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
