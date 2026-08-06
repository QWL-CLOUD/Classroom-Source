import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function downloadedJson(download: Download) {
  const path = await download.path();
  expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8')) as Record<string, unknown>;
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
  await expect(page.getByText('Version 16', { exact: true })).toBeVisible();
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
      actualSchemaVersion: 16,
      expectedSchemaVersion: 16,
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
  expect(Object.keys(diagnostic.portableTableCounts as Record<string, number>)).toHaveLength(32);
  expect(diagnosticText).not.toContain('Pilot 2026–2027');
  expect(diagnosticText).not.toContain('payloadJson');

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((violation) => violation.impact === 'critical'),
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);

  await page.goto('./#/export');
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full backup' }).click();
  const backup = await downloadedJson(await backupDownload);
  expect(backup).toMatchObject({
    format: 'classroom-v20-backup-v1',
    databaseSchemaVersion: 16,
    appVersion: '20.0.0-pilot.1',
  });
});

test('personal pilot core routes remain usable without horizontal overflow on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ['today?date=2026-08-05', 'calendar?date=2026-08-05', 'system-health']) {
    await page.goto(`./#/${route}`);
    await expect(page.locator('main')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }

  const menu = page.getByRole('button', { name: 'Open navigation' });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.getByRole('complementary', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeFocused();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((violation) => violation.impact === 'critical'),
    accessibility.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});
