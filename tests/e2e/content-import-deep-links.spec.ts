import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const deepLinkRecords = {
  schoolYears: [
    {
      id: 'deep-link-year',
      label: 'Deep Link 2026–2027',
      startsOn: '2026-08-24',
      endsOn: '2027-06-18',
      active: true,
      lifecycleState: 'active',
    },
  ],
  learnerContexts: [
    {
      id: 'deep-link-class',
      kind: 'class',
      name: 'Deep Link Class',
      schoolYearId: 'deep-link-year',
      status: 'active',
    },
    {
      id: 'deep-link-group',
      kind: 'group',
      name: 'Deep Link Group',
      schoolYearId: 'deep-link-year',
      status: 'active',
    },
    {
      id: 'deep-link-individual',
      kind: 'individual',
      name: 'Deep Link Individual',
      schoolYearId: 'deep-link-year',
      status: 'active',
    },
  ],
};

async function seedContexts(page: Page): Promise<void> {
  await page.goto('./#/learners');
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['schoolYears', 'learnerContexts', 'rosterMemberships'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        transaction.objectStore('schoolYears').clear();
        transaction.objectStore('learnerContexts').clear();
        transaction.objectStore('rosterMemberships').clear();
        for (const schoolYear of records.schoolYears) {
          transaction.objectStore('schoolYears').put(schoolYear);
        }
        for (const context of records.learnerContexts) {
          transaction.objectStore('learnerContexts').put(context);
        }
      });
    } finally {
      database.close();
    }
  }, deepLinkRecords);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Learners' })).toBeVisible();
}

test('CONTENT navigation and Library tabs preserve canonical import deep links', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/library?tab=activities');

  const navigation = page.getByRole('complementary', { name: 'Primary navigation' });
  await expect(navigation.getByRole('button', { name: 'Content' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  for (const label of ['Library', 'Lesson Templates', 'Standards', 'Categories & Labels']) {
    await expect(navigation.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await expect(navigation.getByRole('button', { name: 'Settings & Data' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(navigation.getByRole('link', { name: 'Import Center' })).toBeHidden();

  const activities = page.getByRole('button', { name: 'Activities', exact: true });
  const resources = page.getByRole('button', { name: 'Resources', exact: true });
  const assessments = page.getByRole('button', { name: 'Assessments', exact: true });

  await expect(activities).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'Import activities' })).toBeVisible();
  await page.reload();
  await expect(activities).toHaveAttribute('aria-pressed', 'true');

  await resources.click();
  await expect(page).toHaveURL(/#\/library\?tab=resources$/);
  await expect(page.getByRole('link', { name: 'Import resources' })).toBeVisible();

  await assessments.click();
  await expect(page).toHaveURL(/#\/library\?tab=assessments$/);
  await expect(page.getByRole('link', { name: 'Import assessments' })).toBeVisible();

  await page.goBack();
  await expect(resources).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(activities).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(resources).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(resources).toHaveAttribute('aria-pressed', 'true');

  await page.goto('./#/library?tab=unknown');
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto('./#/library?tab=activities&tab=resources');
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const imports = [
    ['activities', 'Import activities', 'Import Activities'],
    ['resources', 'Import resources', 'Import Resources'],
    ['assessments', 'Import assessments', 'Import Assessments'],
  ] as const;
  for (const [tab, action, heading] of imports) {
    await page.goto(`./#/library?tab=${tab}`);
    await page.getByRole('link', { name: action }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library?tab=resources');
  await page.getByRole('link', { name: 'Import resources' }).focus();
  await expect(page.getByRole('link', { name: 'Import resources' })).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('Standards exposes one contextual link to the canonical Import Center', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/standards');

  const importStandards = page.getByRole('link', { name: 'Import standards' });
  await expect(importStandards).toBeVisible();
  await page.getByRole('button', { name: 'Coverage' }).click();
  await expect(importStandards).toBeVisible();
  await importStandards.click();
  await expect(page).toHaveURL(/#\/import\?type=standards$/);
  await expect(page.getByRole('heading', { name: 'Import Standards' })).toBeVisible();
});

test('Class and Group rosters deep-link with context while Individual stays roster-free', async ({
  page,
}) => {
  await seedContexts(page);

  await page.goto(
    './#/learners?schoolYear=deep-link-year&context=deep-link-class&workspace=roster',
  );
  const classRoster = page.getByRole('region', { name: 'Roster for Deep Link Class' });
  await classRoster.getByRole('link', { name: 'Import roster' }).click();
  await expect(page).toHaveURL(/type=roster&context=deep-link-class/);
  await expect(page.getByLabel('Class or Group *')).toHaveValue('deep-link-class');

  await page.goto(
    './#/learners?schoolYear=deep-link-year&context=deep-link-group&workspace=roster',
  );
  const groupRoster = page.getByRole('region', { name: 'Roster for Deep Link Group' });
  await groupRoster.getByRole('link', { name: 'Import roster' }).click();
  await expect(page).toHaveURL(/type=roster&context=deep-link-group/);
  await expect(page.getByLabel('Class or Group *')).toHaveValue('deep-link-group');

  await page.goto(
    './#/learners?schoolYear=deep-link-year&context=deep-link-individual&workspace=planning',
  );
  await expect(page.getByRole('link', { name: 'Import roster' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /Roster for Deep Link Individual/ })).toHaveCount(
    0,
  );
});
