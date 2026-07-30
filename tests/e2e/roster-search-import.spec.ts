import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';

const records = {
  schoolYears: [
    {
      id: 'import-year',
      label: 'Import 2026–2027',
      startsOn: '2026-08-24',
      endsOn: '2027-06-18',
      active: true,
      lifecycleState: 'active',
    },
  ],
  learnerContexts: [
    {
      id: 'import-class',
      kind: 'class',
      name: 'Import Grade 3',
      schoolYearId: 'import-year',
      status: 'active',
    },
    {
      id: 'import-group',
      kind: 'group',
      name: 'Import Reading Group',
      schoolYearId: 'import-year',
      status: 'active',
    },
  ],
  studentRecords: [
    {
      id: 'import-amy',
      name: 'Amy Chen',
      preferredName: 'Amy',
      status: 'active',
      notes: 'Available Student record.',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
    {
      id: 'import-ben',
      name: 'Ben Lee',
      status: 'active',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
    {
      id: 'import-dana',
      name: 'Dana Old',
      status: 'archived',
      archivedAt: '2026-07-27T12:00:00.000Z',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
  ],
  rosterMemberships: [
    {
      id: 'import-ben-membership',
      contextId: 'import-class',
      studentId: 'import-ben',
      role: 'Student',
      createdAt: '2026-07-27T12:00:00.000Z',
    },
  ],
};

async function seed(page: Page): Promise<void> {
  await page.goto('./#/learners');
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
  await page.evaluate(async (values) => {
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
        for (const [storeName, rows] of Object.entries(values) as [string, unknown[]][]) {
          const store = transaction.objectStore(storeName);
          store.clear();
          for (const row of rows) store.put(row);
        }
      });
    } finally {
      database.close();
    }
  }, records);
  await page.goto('./#/learners?schoolYear=import-year&context=import-class&workspace=roster');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
}

test('Roster search clearly separates current roster filtering from Student record search', async ({
  page,
}) => {
  await seed(page);
  const roster = page.getByRole('region', { name: 'Roster for Import Grade 3' });
  const list = roster.getByRole('list', { name: 'Students in Import Grade 3' });

  await expect(list.getByLabel('Ben Lee, active student')).toBeVisible();
  const rosterSearch = roster.getByLabel('Search this roster');
  await expect(rosterSearch).toBeVisible();
  const searchPresentation = await rosterSearch.evaluate((element) => {
    const input = element as HTMLInputElement;
    const style = getComputedStyle(input);
    const bounds = input.getBoundingClientRect();
    return {
      nestedInLabel: input.closest('label') !== null,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
      type: input.type,
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
  });
  expect(searchPresentation).toMatchObject({
    nestedInLabel: false,
    borderTopWidth: '0px',
    borderRightWidth: '0px',
    borderBottomWidth: '0px',
    borderLeftWidth: '0px',
    outlineStyle: 'none',
    boxShadow: 'none',
    type: 'search',
  });
  expect(searchPresentation.width).toBeGreaterThan(80);
  expect(searchPresentation.height).toBeGreaterThanOrEqual(40);
  await rosterSearch.fill('missing');
  await expect(roster.getByRole('heading', { name: 'No matching students' })).toBeVisible();
  await roster.getByRole('button', { name: 'Clear roster search' }).click();
  await expect(list.getByLabel('Ben Lee, active student')).toBeVisible();

  await roster.getByRole('button', { name: 'Add students' }).click();
  await roster.getByLabel('Search all Student records').fill('Amy');
  await roster.getByLabel('Student *').selectOption('import-amy');
  await roster.getByRole('button', { name: 'Add student', exact: true }).click();
  await expect(list.getByLabel('Amy, active student')).toBeVisible();

  await roster.getByLabel('Search this roster').fill('Amy');
  await expect(list.getByLabel('Amy, active student')).toBeVisible();
  await expect(list.getByLabel('Ben Lee, active student')).toHaveCount(0);
});

async function readRosterImportState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const transaction = database.transaction(
        ['studentRecords', 'rosterMemberships', 'importRuns'],
        'readonly',
      );
      const readAll = <T>(storeName: string) =>
        new Promise<T[]>((resolve, reject) => {
          const request = transaction.objectStore(storeName).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result as T[]);
        });
      const [students, memberships, importRuns] = await Promise.all([
        readAll<{ id: string }>('studentRecords'),
        readAll<{ contextId: string }>('rosterMemberships'),
        readAll<{ importType: string; contextId?: string }>('importRuns'),
      ]);
      return {
        students: students.length,
        memberships: memberships.filter((membership) => membership.contextId === 'import-class')
          .length,
        rosterRuns: importRuns.filter(
          (run) => run.importType === 'roster' && run.contextId === 'import-class',
        ).length,
      };
    } finally {
      database.close();
    }
  });
}

test('CSV roster import previews duplicate decisions and commits as one global Undo action', async ({
  page,
}) => {
  await seed(page);
  const roster = page.getByRole('region', { name: 'Roster for Import Grade 3' });
  await roster.getByRole('link', { name: 'Import students' }).click();
  await expect(page).toHaveURL(/#\/import\?type=roster&context=import-class$/);
  await expect(page.getByRole('heading', { name: 'Import a Class or Group roster' })).toBeVisible();
  await expect(page.getByLabel('Class or Group *')).toHaveValue('import-class');

  await page.getByLabel('Choose CSV or XLSX roster file').setInputFiles({
    name: 'grade-3-roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      [
        'Name,Preferred Name,Role,Notes',
        'Amy Chen,Amy,Student,Reuse existing',
        'Ben Lee,,Student,Already present',
        'Elena Park,Ellie,Student,Create new',
        'Dana Old,,Student,Archived',
        'Elena Park,Ellie,Student,Duplicate',
      ].join('\n'),
    ),
  });

  const preview = page.getByLabel('Scrollable roster import preview');
  await expect(preview.getByText('Existing Student', { exact: true })).toBeVisible();
  await expect(preview.getByText('Already in roster', { exact: true })).toBeVisible();
  await expect(preview.getByText('New Student', { exact: true })).toBeVisible();
  await expect(preview.getByText('Archived match', { exact: true })).toBeVisible();
  await expect(preview.getByText('Duplicate row', { exact: true })).toBeVisible();
  await expect
    .poll(() => readRosterImportState(page))
    .toEqual({
      students: 3,
      memberships: 1,
      rosterRuns: 0,
    });

  await page.getByLabel(/Commit the selected Student rows/).check();
  await page.getByRole('button', { name: 'Import 2 students' }).click();
  await expect(page.getByText(/Imported 2 students: 1 new and 1 existing/)).toBeVisible();
  await expect
    .poll(() => readRosterImportState(page))
    .toEqual({
      students: 4,
      memberships: 3,
      rosterRuns: 1,
    });
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute(
    'title',
    /Undo Import 2 students to Import Grade 3/,
  );

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => readRosterImportState(page))
    .toEqual({
      students: 3,
      memberships: 1,
      rosterRuns: 0,
    });
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toHaveAttribute(
    'title',
    /Redo Import 2 students to Import Grade 3/,
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(() => readRosterImportState(page))
    .toEqual({
      students: 4,
      memberships: 3,
      rosterRuns: 1,
    });

  await page.getByRole('link', { name: 'Open roster' }).first().click();
  const importedRoster = page.getByRole('region', { name: 'Roster for Import Grade 3' });
  const list = importedRoster.getByRole('list', { name: 'Students in Import Grade 3' });
  await expect(list.getByLabel('Amy, active student')).toBeVisible();
  await expect(list.getByLabel('Ellie, active student')).toBeVisible();
});

test('XLSX roster import requires explicit worksheet review before any write', async ({ page }) => {
  await seed(page);
  const roster = page.getByRole('region', { name: 'Roster for Import Grade 3' });
  await roster.getByRole('link', { name: 'Import students' }).click();

  const cover = XLSX.utils.aoa_to_sheet([['Read me'], ['Choose the Roster Import worksheet.']]);
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Name', 'Preferred Name', 'Role', 'Notes'],
    ['Workbook Student', 'Excel', 'Student', 'XLSX preview'],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, cover, 'Instructions');
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Roster Import');
  const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  await page.getByLabel('Choose CSV or XLSX roster file').setInputFiles({
    name: 'roster.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(new Uint8Array(data)),
  });

  const worksheetSelect = page.getByRole('combobox', {
    name: 'Worksheet',
    exact: true,
  });
  await expect(worksheetSelect).toHaveValue('0');
  await worksheetSelect.selectOption({ label: 'Roster Import' });
  const preview = page.getByLabel('Scrollable roster import preview');
  await expect(preview.getByText('Workbook Student', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 1 student' })).toBeDisabled();
  await expect
    .poll(() => readRosterImportState(page))
    .toEqual({
      students: 3,
      memberships: 1,
      rosterRuns: 0,
    });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await preview.focus();
  await expect(preview).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
