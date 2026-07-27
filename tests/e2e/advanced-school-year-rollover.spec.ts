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

interface SeedOptions {
  targetContextAndConflict?: boolean;
}

interface SeedScheduleBlock {
  id: string;
  parentId?: string;
  contextId?: string;
  title: string;
  subject: string;
  category: string;
  kind: 'container' | 'teachable' | 'routine' | 'transition';
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  effectiveFrom: string;
  effectiveTo: string;
  planningEnabled: boolean;
  bumpEnabled: boolean;
  showInWeek: boolean;
  sortOrder: number;
}

async function seedRollover(page: Page, options: SeedOptions = {}): Promise<void> {
  await waitForSchema(page);
  await page.evaluate(async ({ targetContextAndConflict }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const schoolYears = [
      {
        id: 'source-year',
        label: '2026–2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
        lifecycleState: 'active',
      },
      {
        id: 'target-year',
        label: '2027–2028',
        startsOn: '2027-07-01',
        endsOn: '2028-06-30',
        active: false,
        lifecycleState: 'active',
      },
    ];
    const contexts = [
      {
        id: 'source-class',
        kind: 'class',
        name: 'Grade 3',
        schoolYearId: 'source-year',
        status: 'active',
      },
      {
        id: 'source-group',
        kind: 'group',
        name: 'Blue Group',
        schoolYearId: 'source-year',
        status: 'active',
      },
      {
        id: 'source-learner',
        kind: 'individual',
        name: 'Avery',
        schoolYearId: 'source-year',
        status: 'active',
      },
    ];
    if (targetContextAndConflict) {
      contexts.push({
        id: 'target-class',
        kind: 'class',
        name: 'Grade 3',
        schoolYearId: 'target-year',
        status: 'active',
      });
    }
    const memberships = [
      {
        id: 'class-group',
        containerContextId: 'source-class',
        memberContextId: 'source-group',
      },
      {
        id: 'group-learner',
        containerContextId: 'source-group',
        memberContextId: 'source-learner',
      },
    ];
    const scheduleBlocks: SeedScheduleBlock[] = [
      {
        id: 'source-day',
        title: 'Grade 3 day',
        subject: '',
        category: 'Teaching',
        kind: 'container',
        weekdays: [1, 2, 3, 4, 5],
        startMinute: 480,
        endMinute: 900,
        effectiveFrom: '2026-07-01',
        effectiveTo: '2027-06-30',
        planningEnabled: false,
        bumpEnabled: false,
        showInWeek: true,
        sortOrder: 0,
      },
      {
        id: 'source-math',
        parentId: 'source-day',
        contextId: 'source-class',
        title: 'Math',
        subject: 'Math',
        category: 'Teaching',
        kind: 'teachable',
        weekdays: [1, 3],
        startMinute: 540,
        endMinute: 600,
        effectiveFrom: '2026-07-01',
        effectiveTo: '2027-06-30',
        planningEnabled: true,
        bumpEnabled: true,
        showInWeek: true,
        sortOrder: 1,
      },
    ];
    if (targetContextAndConflict) {
      scheduleBlocks.push({
        id: 'target-conflict',
        contextId: 'target-class',
        title: 'Target intervention',
        subject: 'Math',
        category: 'Teaching',
        kind: 'teachable',
        weekdays: [1],
        startMinute: 570,
        endMinute: 630,
        effectiveFrom: '2027-07-01',
        effectiveTo: '2028-06-30',
        planningEnabled: true,
        bumpEnabled: false,
        showInWeek: true,
        sortOrder: 0,
      });
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['schoolYears', 'learnerContexts', 'contextMemberships', 'scheduleBlocks', 'tasks'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        for (const value of schoolYears) transaction.objectStore('schoolYears').put(value);
        for (const value of contexts) transaction.objectStore('learnerContexts').put(value);
        for (const value of memberships) transaction.objectStore('contextMemberships').put(value);
        for (const value of scheduleBlocks) transaction.objectStore('scheduleBlocks').put(value);
        transaction.objectStore('tasks').put({
          id: 'source-task',
          title: 'Historical source task',
          status: 'active',
          order: 0,
          createdAt: '2026-07-27T12:00:00.000Z',
          updatedAt: '2026-07-27T12:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  }, options);
}

async function readRolloverState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const transaction = database.transaction(
        [
          'schoolYears',
          'learnerContexts',
          'contextMemberships',
          'scheduleBlocks',
          'tasks',
          'backupSnapshots',
          'changeLog',
        ],
        'readonly',
      );
      const all = (store: string) =>
        new Promise<Record<string, unknown>[]>((resolve, reject) => {
          const request = transaction.objectStore(store).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
        });
      return {
        years: await all('schoolYears'),
        contexts: await all('learnerContexts'),
        memberships: await all('contextMemberships'),
        schedules: await all('scheduleBlocks'),
        tasks: await all('tasks'),
        snapshots: await all('backupSnapshots'),
        logs: await all('changeLog'),
      };
    } finally {
      database.close();
    }
  });
}

test('Advanced rollover previews, saves a safety backup, commits once, and globally undoes', async ({
  page,
}) => {
  await page.goto('./#/settings/rollover');
  await seedRollover(page);
  await page.reload();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Advanced school-year rollover' }),
  ).toBeVisible();
  await expect(page.getByLabel('Source school year')).toHaveValue('source-year');
  await expect(page.getByLabel('Target school year')).toHaveValue('target-year');
  await page.getByRole('button', { name: 'Select all active' }).click();
  await page.getByLabel('Copy selected Schedule Blocks').check();
  await page.getByRole('button', { name: 'Select all available' }).click();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  const summary = page.getByLabel('Rollover preview summary');
  await expect(summary.getByText('3', { exact: true }).first()).toBeVisible();
  await expect(summary.getByText('2', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: /2027-07-01–2028-06-30/ }).first()).toBeVisible();
  await expect
    .poll(() => readRolloverState(page))
    .toMatchObject({
      contexts: expect.arrayContaining([expect.objectContaining({ id: 'source-class' })]),
      snapshots: [],
    });

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations,
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);

  await page.getByLabel(/I reviewed the learner, placement, date, and conflict preview/).check();
  await page.getByLabel(/I understand that Plans, Sessions, Tasks/).check();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Commit protected rollover' }).click();
  await expect(page.getByRole('heading', { name: 'Rollover committed safely' })).toBeVisible();

  await expect
    .poll(() => readRolloverState(page))
    .toMatchObject({
      years: expect.arrayContaining([
        expect.objectContaining({ id: 'target-year', active: false }),
      ]),
      contexts: expect.arrayContaining([
        expect.objectContaining({ schoolYearId: 'target-year', name: 'Grade 3' }),
        expect.objectContaining({ schoolYearId: 'target-year', name: 'Blue Group' }),
        expect.objectContaining({ schoolYearId: 'target-year', name: 'Avery' }),
      ]),
      tasks: [expect.objectContaining({ id: 'source-task' })],
      snapshots: [expect.objectContaining({ kind: 'pre-rollover' })],
      logs: expect.arrayContaining([
        expect.objectContaining({ commandType: 'school-year-rollover.commit' }),
      ]),
    });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => {
      const state = await readRolloverState(page);
      return {
        targetContexts: state.contexts.filter((value) => value.schoolYearId === 'target-year')
          .length,
        schedules: state.schedules.length,
        snapshots: state.snapshots.length,
      };
    })
    .toEqual({ targetContexts: 0, schedules: 2, snapshots: 1 });

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect
    .poll(
      async () =>
        (await readRolloverState(page)).contexts.filter(
          (value) => value.schoolYearId === 'target-year',
        ).length,
    )
    .toBe(3);
});

test('Advanced rollover blocks Schedule conflicts and stays accessible on a compact viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/settings/rollover');
  await seedRollover(page, { targetContextAndConflict: true });
  await page.reload();

  await page.getByLabel('Grade 3').check();
  await page.getByLabel('Copy selected Schedule Blocks').check();
  await page.getByLabel(/Math/).check();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  await expect(page.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(page.getByText(/Schedule conflict/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commit protected rollover' })).toBeDisabled();
  await expect
    .poll(() => readRolloverState(page))
    .toMatchObject({
      snapshots: [],
      contexts: expect.arrayContaining([expect.objectContaining({ id: 'target-class' })]),
    });

  const scroller = page.getByLabel('Scrollable rollover Schedule preview');
  await scroller.focus();
  await expect(scroller).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations,
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});
