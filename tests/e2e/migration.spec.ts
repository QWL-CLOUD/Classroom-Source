import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const syntheticBackup = JSON.stringify({
  format: 'classroom-full-local-backup-v18',
  appVersion: '18.0.0',
  storageEncoding: 'raw-localStorage-strings',
  data: {
    'cos-current-school-year': JSON.stringify('2026–2027'),
    'cos-calendar-events': JSON.stringify([
      { id: 'event-1', title: 'School event', date: '2026-07-14' },
    ]),
    'cos-schedule-blocks': JSON.stringify([
      {
        id: 'block-1',
        block: 'Chinese',
        days: ['Monday'],
        start: '09:00',
        end: '09:45',
        category: 'Teaching',
      },
    ]),
    'cos-lessons': '[]',
    'cos-toolkit': JSON.stringify([{ id: 'activity-1' }]),
    'cos-planning-templates-v19': JSON.stringify([{ id: 'template-1', flowBlocks: [] }]),
    'cos-calendar-quarantine-v19': JSON.stringify([{ id: 'quarantine-1', date: '2026-22-26' }]),
  },
});

test('migration preview generates a reversible plan without writing records', async ({ page }) => {
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
  await expect(page.getByRole('row', { name: /Planning templates/ })).toContainText('Review');
  await expect(page.getByRole('row', { name: /Calendar quarantine/ })).toContainText('Quarantine');
  await expect(page.getByText('Scanner write operations: 0')).toBeVisible();

  await page.getByRole('button', { name: 'Generate reversible plan' }).click();

  await expect(page.getByRole('heading', { name: 'Reversible migration plan' })).toBeVisible();
  await expect(page.getByText('Rollback manifest is complete.')).toBeVisible();
  await expect(page.getByText('Plan write operations: 0')).toBeVisible();

  const planTable = page.getByRole('region', {
    name: 'Reversible migration plan table',
  });

  const calendarEventsRow = planTable
    .getByRole('rowheader', {
      name: 'calendarEvents',
      exact: true,
    })
    .locator('..');

  const libraryRow = planTable
    .getByRole('rowheader', {
      name: 'Library tables (future phase)',
      exact: true,
    })
    .locator('..');

  await expect(calendarEventsRow.getByRole('cell').nth(0)).toHaveText('1');
  await expect(libraryRow.getByRole('cell').nth(2)).toHaveText('1');

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    results.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});
