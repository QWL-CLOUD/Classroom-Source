import AxeBuilder from '@axe-core/playwright';

import { expect, test, type Page } from '@playwright/test';

const rosterRecords = {
  schoolYears: [
    {
      id: 'roster-year',
      label: 'Roster 2026–2027',
      startsOn: '2026-08-24',
      endsOn: '2027-06-18',
      active: true,
      lifecycleState: 'active',
    },
  ],
  learnerContexts: [
    {
      id: 'roster-class',
      kind: 'class',
      name: 'Roster Grade 3',
      schoolYearId: 'roster-year',
      status: 'active',
    },
    {
      id: 'roster-group',
      kind: 'group',
      name: 'Independent Reading Group',
      schoolYearId: 'roster-year',
      status: 'active',
    },
    {
      id: 'roster-individual',
      kind: 'individual',
      name: 'One-on-one workspace',
      schoolYearId: 'roster-year',
      status: 'active',
    },
  ],
  studentRecords: [
    {
      id: 'student-amy',
      name: 'Amy Chen',
      preferredName: 'Amy',
      status: 'active',
      notes: 'Class roster Student.',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
    {
      id: 'student-ben',
      name: 'Ben Lee',
      status: 'archived',
      archivedAt: '2026-07-27T12:00:00.000Z',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
    {
      id: 'student-carlos',
      name: 'Carlos Ruiz',
      status: 'active',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
    {
      id: 'student-diana',
      name: 'Diana Wu',
      status: 'active',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
  ],
  rosterMemberships: [
    {
      id: 'membership-class-amy',
      contextId: 'roster-class',
      studentId: 'student-amy',
      role: 'Student',
      createdAt: '2026-07-27T12:00:00.000Z',
    },
    {
      id: 'membership-class-ben',
      contextId: 'roster-class',
      studentId: 'student-ben',
      createdAt: '2026-07-27T12:00:00.000Z',
    },
    {
      id: 'membership-group-diana',
      contextId: 'roster-group',
      studentId: 'student-diana',
      createdAt: '2026-07-27T12:00:00.000Z',
    },
  ],
};

async function seedRosterRecords(page: Page): Promise<void> {
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
  }, rosterRecords);
}

async function openRosterWorkspace(page: Page): Promise<void> {
  await page.goto('./#/learners');
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
  await seedRosterRecords(page);
  await page.goto('./#/learners?schoolYear=roster-year&context=roster-class&workspace=roster');
  // Native IndexedDB fixture writes are external to Dexie liveQuery.
  // Reload so the application reopens schema v11 and reads the seeded records.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
}

test('Class and Group manage independent Student rosters with global Undo', async ({ page }) => {
  await openRosterWorkspace(page);

  const classWorkspace = page.getByRole('region', {
    name: 'Planning for Roster Grade 3',
  });
  await expect(classWorkspace.getByRole('tab', { name: 'Roster' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const classRoster = page.getByRole('region', {
    name: 'Roster for Roster Grade 3',
  });
  const classList = classRoster.getByRole('list', {
    name: 'Students in Roster Grade 3',
  });
  await expect(classList.getByLabel('Amy, active student')).toBeVisible();
  await expect(classList.getByLabel('Ben Lee, archived student')).toBeVisible();
  await expect(classRoster.getByText(/1 archived Student/)).toBeVisible();

  await classRoster.getByLabel('Search this roster').fill('Amy');
  await expect(classList.getByLabel('Amy, active student')).toBeVisible();
  await expect(classList.getByText('Ben Lee')).toHaveCount(0);
  await classRoster.getByLabel('Search this roster').fill('');

  await classRoster.getByRole('button', { name: 'Add students' }).click();
  await classRoster.getByLabel('Student *').selectOption('student-carlos');
  await classRoster.getByRole('button', { name: 'Add student', exact: true }).click();
  await expect(classList.getByText('Carlos Ruiz')).toBeVisible();

  const undoButton = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undoButton).toHaveAttribute('title', /Undo Add Carlos Ruiz to Roster Grade 3/);
  await undoButton.click();
  await expect(classList.getByText('Carlos Ruiz')).toHaveCount(0);

  const contexts = page.getByRole('region', { name: 'Learner contexts' });
  await contexts
    .getByRole('button', {
      name: 'Open Independent Reading Group group',
    })
    .click();
  const groupWorkspace = page.getByRole('region', {
    name: 'Planning for Independent Reading Group',
  });
  await expect(groupWorkspace.getByRole('tab', { name: 'Roster' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const groupRoster = page.getByRole('region', {
    name: 'Roster for Independent Reading Group',
  });
  const groupList = groupRoster.getByRole('list', {
    name: 'Students in Independent Reading Group',
  });
  await expect(groupList.getByText('Diana Wu')).toBeVisible();
  await expect(groupList.getByLabel('Amy, active student')).toHaveCount(0);

  await groupRoster.getByRole('button', { name: 'Add students' }).click();
  await groupRoster.getByLabel('Student *').selectOption('student-carlos');
  await groupRoster.getByRole('button', { name: 'Add student', exact: true }).click();
  await expect(groupList.getByText('Carlos Ruiz')).toBeVisible();

  await contexts.getByRole('button', { name: 'Open One-on-one workspace individual' }).click();
  await expect(
    page
      .getByRole('region', {
        name: 'Planning for One-on-one workspace',
      })
      .getByRole('tab', { name: 'Roster' }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('region', {
        name: 'Planning for One-on-one workspace',
      })
      .getByRole('tabpanel', { name: 'Planning' }),
  ).toBeVisible();
});

test('Roster workspace creates and removes membership without deleting the Student', async ({
  page,
}) => {
  await openRosterWorkspace(page);

  const roster = page.getByRole('region', {
    name: 'Roster for Roster Grade 3',
  });
  await roster.getByRole('button', { name: 'Add students' }).click();
  await roster.getByLabel('Student name *').fill('Elena Park');
  await roster.getByLabel('Preferred name').fill('Ellie');
  await roster.getByRole('button', { name: 'Create and add student' }).click();

  const list = roster.getByRole('list', {
    name: 'Students in Roster Grade 3',
  });
  const elena = list.getByLabel('Ellie, active student');
  await expect(elena).toBeVisible();
  await expect(elena.getByText('Elena Park')).toBeVisible();

  await elena.getByRole('button', { name: 'Remove' }).click();
  await elena.getByRole('button', { name: 'Confirm remove Ellie' }).click();
  await expect(elena).toHaveCount(0);

  await roster.getByRole('button', { name: 'Add students' }).click();
  await expect(roster.getByLabel('Student *')).toContainText('Ellie');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(roster).toBeVisible();
  const widthState = await roster.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(widthState.scrollWidth).toBeLessThanOrEqual(widthState.clientWidth + 1);

  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Roster for Roster Grade 3"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
