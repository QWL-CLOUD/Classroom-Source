import AxeBuilder from '@axe-core/playwright';

import { expect, test, type Page } from '@playwright/test';

const individualLinkRecords = {
  schoolYears: [
    {
      id: 'link-year',
      label: 'Link 2026–2027',
      startsOn: '2026-08-24',
      endsOn: '2027-06-18',
      active: true,
      lifecycleState: 'active',
    },
  ],
  learnerContexts: [
    {
      id: 'link-class',
      kind: 'class',
      name: 'Link Grade 3',
      schoolYearId: 'link-year',
      status: 'active',
    },
    {
      id: 'link-individual',
      kind: 'individual',
      name: 'Carlie one-on-one',
      schoolYearId: 'link-year',
      status: 'active',
    },
    {
      id: 'linked-individual',
      kind: 'individual',
      name: 'Archived Student session',
      schoolYearId: 'link-year',
      status: 'active',
      linkedStudentId: 'student-archived',
    },
  ],
  studentRecords: [
    {
      id: 'student-amy',
      name: 'Amy Chen',
      preferredName: 'Amy',
      status: 'active',
      notes: 'Canonical Student record.',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
    {
      id: 'student-ben',
      name: 'Ben Lee',
      status: 'active',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
    {
      id: 'student-archived',
      name: 'Archived Learner',
      status: 'archived',
      archivedAt: '2026-07-27T12:00:00.000Z',
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    },
  ],
  rosterMemberships: [
    {
      id: 'link-class-membership',
      contextId: 'link-class',
      studentId: 'student-amy',
      createdAt: '2026-07-27T12:00:00.000Z',
    },
  ],
};

async function seedIndividualLinkRecords(page: Page): Promise<void> {
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
  }, individualLinkRecords);
}

async function openIndividualStudentWorkspace(
  page: Page,
  contextId = 'link-individual',
): Promise<void> {
  await page.goto('./#/learners');
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
  await seedIndividualLinkRecords(page);
  await page.goto(`./#/learners?schoolYear=link-year&context=${contextId}&workspace=student`);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
}

test('Individual links an existing Student without creating roster membership and globally undoes', async ({
  page,
}) => {
  await openIndividualStudentWorkspace(page);

  const workspace = page.getByRole('region', {
    name: 'Planning for Carlie one-on-one',
  });
  await expect(workspace.getByRole('tab', { name: 'Student', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(workspace.getByRole('tab', { name: 'Roster' })).toHaveCount(0);

  const panel = page.getByRole('region', {
    name: 'Student link for Carlie one-on-one',
  });
  await expect(panel.getByText('No Student linked')).toBeVisible();
  await panel.getByLabel('Search Student records').fill('Amy');
  await panel.getByLabel('Student *').selectOption('student-amy');
  await panel.getByRole('button', { name: 'Link Student' }).click();

  await expect(panel.getByRole('article', { name: 'Linked Student Amy' })).toBeVisible();
  await expect(panel.getByText('Canonical Student record.', { exact: true })).toBeVisible();

  const membershipCount = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const transaction = database.transaction(['rosterMemberships'], 'readonly');
        const request = transaction.objectStore('rosterMemberships').count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    } finally {
      database.close();
    }
  });
  expect(membershipCount).toBe(1);

  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toHaveAttribute('title', /Undo Link Carlie one-on-one to student Amy Chen/);
  await undo.click();
  await expect(panel.getByText('No Student linked')).toBeVisible();

  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await redo.click();
  await expect(panel.getByRole('article', { name: 'Linked Student Amy' })).toBeVisible();

  const contexts = page.getByRole('region', { name: 'Learner contexts' });
  await contexts.getByRole('button', { name: 'Open Link Grade 3 class' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Planning for Link Grade 3' })
      .getByRole('tab', { name: 'Student' }),
  ).toHaveCount(0);
});

test('Individual atomically creates a Student link and explicitly unlinks archived Student records', async ({
  page,
}) => {
  await openIndividualStudentWorkspace(page);

  const panel = page.getByRole('region', {
    name: 'Student link for Carlie one-on-one',
  });
  await panel.getByRole('tab', { name: 'Create Student and link' }).click();
  await panel.getByLabel('Student name *').fill('Elena Park');
  await panel.getByLabel('Preferred name').fill('Ellie');
  await panel.getByLabel('Student notes').fill('Created from the Individual link workspace.');
  await panel.getByRole('button', { name: 'Create Student and link' }).click();

  await expect(panel.getByRole('article', { name: 'Linked Student Ellie' })).toBeVisible();
  await expect(panel.getByText('Elena Park', { exact: true })).toBeVisible();

  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toHaveAttribute(
    'title',
    /Undo Create student “Elena Park” and link to Carlie one-on-one/,
  );
  await undo.click();
  await expect(panel.getByText('No Student linked')).toBeVisible();

  const studentExistsAfterUndo = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const transaction = database.transaction(['studentRecords'], 'readonly');
        const request = transaction.objectStore('studentRecords').getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () =>
          resolve(
            request.result.some((student: { name?: string }) => student.name === 'Elena Park'),
          );
      });
    } finally {
      database.close();
    }
  });
  expect(studentExistsAfterUndo).toBe(false);

  const contexts = page.getByRole('region', { name: 'Learner contexts' });
  await contexts
    .getByRole('button', {
      name: 'Open Archived Student session individual',
    })
    .click();
  await page
    .getByRole('region', {
      name: 'Planning for Archived Student session',
    })
    .getByRole('tab', { name: 'Student' })
    .click();

  const archivedPanel = page.getByRole('region', {
    name: 'Student link for Archived Student session',
  });
  await expect(
    archivedPanel.getByRole('article', {
      name: 'Linked Student Archived Learner',
    }),
  ).toBeVisible();
  await expect(archivedPanel.getByText(/linked Student is archived/)).toBeVisible();

  await archivedPanel.getByRole('button', { name: 'Unlink Student' }).click();
  await archivedPanel.getByRole('button', { name: 'Confirm unlink Archived Learner' }).click();
  await expect(archivedPanel.getByText('No Student linked')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(archivedPanel).toBeVisible();
  const widthState = await archivedPanel.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(widthState.scrollWidth).toBeLessThanOrEqual(widthState.clientWidth + 1);

  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Student link for Archived Student session"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
