import AxeBuilder from '@axe-core/playwright';

import { expect, test, type Page } from '@playwright/test';

const timestamp = '2026-07-27T12:00:00.000Z';

const studentDirectoryRecords = {
  schoolYears: [
    {
      id: 'student-year',
      label: 'Student 2026–2027',
      startsOn: '2026-08-24',
      endsOn: '2027-06-18',
      active: true,
      lifecycleState: 'active',
    },
    {
      id: 'student-old-year',
      label: 'Student 2025–2026',
      startsOn: '2025-08-25',
      endsOn: '2026-06-19',
      active: false,
      lifecycleState: 'archived',
    },
  ],
  learnerContexts: [
    {
      id: 'student-class',
      kind: 'class',
      name: 'Student Grade 3',
      schoolYearId: 'student-year',
      status: 'active',
    },
    {
      id: 'student-group',
      kind: 'group',
      name: 'Student Reading Group',
      schoolYearId: 'student-year',
      status: 'active',
    },
    {
      id: 'student-individual',
      kind: 'individual',
      name: 'Amy one-on-one',
      schoolYearId: 'student-year',
      status: 'active',
      linkedStudentId: 'student-amy',
    },
    {
      id: 'student-archived-group',
      kind: 'group',
      name: 'Archived Reading Group',
      schoolYearId: 'student-old-year',
      status: 'archived',
    },
  ],
  studentRecords: [
    {
      id: 'student-amy',
      name: 'Amy Chen',
      preferredName: 'Amy',
      status: 'active',
      notes: 'Canonical Student notes.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'student-ben',
      name: 'Ben Lee',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'student-archived',
      name: 'Archived Student',
      status: 'archived',
      archivedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  rosterMemberships: [
    {
      id: 'membership-amy-class',
      contextId: 'student-class',
      studentId: 'student-amy',
      role: 'Student',
      createdAt: timestamp,
    },
    {
      id: 'membership-amy-group',
      contextId: 'student-group',
      studentId: 'student-amy',
      role: 'Reader',
      createdAt: timestamp,
    },
    {
      id: 'membership-amy-archived-group',
      contextId: 'student-archived-group',
      studentId: 'student-amy',
      createdAt: timestamp,
    },
  ],
  lessonPlans: [
    {
      id: 'student-plan-class',
      contextId: 'student-class',
      title: 'Class plan',
      subject: 'Chinese',
      workflowState: 'ready',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'student-plan-individual',
      contextId: 'student-individual',
      title: 'Individual plan',
      subject: 'Chinese',
      workflowState: 'ready',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  sessionOccurrences: [
    {
      id: 'student-session',
      lessonPlanId: 'student-plan-individual',
      contextId: 'student-individual',
      date: '2026-09-01',
      startMinute: 540,
      endMinute: 585,
      deliveryState: 'completed',
      completedAt: timestamp,
    },
  ],
  learnerNotices: [
    {
      id: 'student-notice',
      contextId: 'student-group',
      kind: 'ongoing-support',
      title: 'Reading support',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  tasks: [
    {
      id: 'student-task',
      title: 'Prepare reading cards',
      status: 'active',
      contextId: 'student-class',
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
};

async function seedStudentDirectory(page: Page): Promise<void> {
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
  }, studentDirectoryRecords);
}

async function openStudents(page: Page, studentId = 'student-amy'): Promise<void> {
  await page.goto('./#/learners');
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
  await seedStudentDirectory(page);
  await page.goto(`./#/learners?directory=students&student=${studentId}`);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
}

test('Students directory shows canonical relationships and context-owned summaries', async ({
  page,
}) => {
  await openStudents(page);

  const directoryTabs = page.getByRole('tablist', {
    name: 'Learners directory view',
  });
  await expect(directoryTabs.getByRole('tab', { name: 'Students' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const directory = page.getByRole('region', { name: 'Students directory' });
  const profile = directory.getByRole('region', {
    name: 'Student profile for Amy',
  });
  await expect(profile.getByRole('heading', { name: 'Amy' })).toBeVisible();
  await expect(profile.getByText('Canonical Student notes.')).toBeVisible();

  await expect(profile.getByRole('list', { name: 'Class memberships' })).toContainText(
    'Student Grade 3',
  );
  await expect(profile.getByRole('list', { name: 'Group memberships' })).toContainText(
    'Student Reading Group',
  );
  await expect(profile.getByRole('list', { name: 'Group memberships' })).toContainText(
    'Archived Reading Group',
  );
  await expect(profile.getByRole('list', { name: 'Individual workspaces' })).toContainText(
    'Amy one-on-one',
  );

  await expect(profile.getByRole('region', { name: 'Student record summary' })).toContainText('2');
  await expect(profile.getByText('1 completed')).toBeVisible();
  await expect(profile.getByText(/read-through summaries/)).toBeVisible();

  await directory.getByLabel('Search Students').fill('Ben');
  await expect(directory.getByRole('button', { name: 'Open Student Ben Lee' })).toBeVisible();
  await expect(directory.getByRole('button', { name: 'Open Student Amy' })).toHaveCount(0);
  await directory.getByLabel('Clear Student search').click();

  await profile.getByRole('link', { name: 'Open Student Grade 3 roster' }).click();
  await expect(page.getByRole('region', { name: 'Planning for Student Grade 3' })).toBeVisible();
  await expect(
    page
      .getByRole('tablist', { name: 'Learners directory view' })
      .getByRole('tab', { name: 'Contexts' }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('Student profile edits, archives, restores, and globally undoes without changing relationships', async ({
  page,
}) => {
  await openStudents(page);

  const profile = page.getByRole('region', {
    name: 'Student profile for Amy',
  });
  await profile.getByRole('button', { name: 'Edit Student' }).click();
  await profile.getByLabel('Student name *').fill('Amelia Chen');
  await profile.getByLabel('Preferred name').fill('Amelia');
  await profile.getByLabel('Student notes').fill('Updated Student notes.');
  await profile.getByRole('button', { name: 'Save Student' }).click();

  const updatedProfile = page.getByRole('region', {
    name: 'Student profile for Amelia',
  });
  await expect(updatedProfile).toContainText('Updated Student notes.');

  await updatedProfile.getByRole('button', { name: 'Archive Student' }).click();
  await expect(
    page.getByText(/4 Class, Group, or Individual relationships will remain/),
  ).toBeVisible();
  await updatedProfile.getByRole('button', { name: 'Confirm archive Student' }).click();
  await expect(updatedProfile.getByLabel('Student status: Archived')).toBeVisible();

  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toHaveAttribute('title', /Undo Archive student “Amelia Chen”/);
  await undo.click();
  await expect(updatedProfile.getByLabel('Student status: Active')).toBeVisible();
  await expect(updatedProfile.getByRole('list', { name: 'Class memberships' })).toContainText(
    'Student Grade 3',
  );
});

test('Students directory creates an unassigned Student and remains responsive and accessible', async ({
  page,
}) => {
  await openStudents(page, 'student-ben');

  const directory = page.getByRole('region', { name: 'Students directory' });
  await directory.getByRole('button', { name: 'Add Student' }).click();

  const create = page.getByRole('region', { name: 'Add Student' });
  await create.getByLabel('Student name *').fill('Diana Wu');
  await create.getByLabel('Preferred name').fill('Diana');
  await create.getByLabel('Student notes').fill('Created from Students directory.');
  await create.getByRole('button', { name: 'Add Student' }).click();

  const profile = page.getByRole('region', {
    name: 'Student profile for Diana',
  });
  await expect(profile).toContainText('Created from Students directory.');
  await expect(profile.getByText('This Student is not in a Class roster.')).toBeVisible();
  await expect(profile.getByText('This Student is not in a Group roster.')).toBeVisible();
  await expect(
    profile.getByText('No Individual planning context links to this Student.'),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(directory).toBeVisible();
  const widthState = await directory.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(widthState.scrollWidth).toBeLessThanOrEqual(widthState.clientWidth + 1);

  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Students directory"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
