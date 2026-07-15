import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const syntheticBackup = JSON.stringify({
  format: 'classroom-full-local-backup-v18',
  appVersion: '18.0.0',
  storageEncoding: 'raw-localStorage-strings',
  data: {
    'cos-calendar-events': JSON.stringify([{ id: 'event-1', date: '2026-07-14' }]),
    'cos-schedule-blocks': JSON.stringify([{ id: 'block-1' }]),
    'cos-lessons': '[]',
    'cos-toolkit': JSON.stringify([{ id: 'activity-1' }]),
    'cos-calendar-quarantine-v19': JSON.stringify([{ id: 'quarantine-1', date: '2026-22-26' }]),
  },
});

test('migration preview validates recognized stores without writing records', async ({ page }) => {
  await page.goto('./#/migration');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'synthetic-private-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(syntheticBackup),
  });

  await expect(page.getByText('Backup envelope is readable')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Detailed store preview' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Calendar events/ })).toContainText('Ready');
  await expect(page.getByRole('row', { name: /Toolkit activities/ })).toContainText('Deferred');
  await expect(page.getByRole('row', { name: /Calendar quarantine/ })).toContainText('Quarantine');
  await expect(page.getByText('Scanner write operations: 0')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    results.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});
