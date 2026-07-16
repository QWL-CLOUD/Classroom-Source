import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('Calendar event editing is validated, transactional, and undoable', async ({ page }) => {
  await page.goto('./#/calendar/edit?date=2026-07-20');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Calendar event editor' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'New event' }).click();
  const editor = page.getByRole('region', { name: 'Calendar event editor' });
  await expect(editor).toBeVisible();

  await editor.getByLabel('Title').fill('Synthetic family conference');
  await editor.getByLabel('All-day event').uncheck();
  await editor.getByLabel('Start time').fill('13:15');
  await editor.getByLabel('End time').fill('14:00');
  await editor.getByLabel('Category').fill('Meeting');
  await editor.getByLabel('Details').fill('Synthetic browser validation record.');
  await editor.getByRole('button', { name: 'Save event' }).click();

  const eventList = page.getByRole('list', {
    name: 'July 2026 calendar events',
  });
  const eventItem = eventList.getByText('Synthetic family conference');
  await expect(eventItem).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

  await eventList.getByRole('button', { name: 'Edit' }).click();
  await editor.getByLabel('Title').fill('Synthetic revised conference');
  await editor.getByRole('button', { name: 'Save event' }).click();
  await expect(eventList.getByText('Synthetic revised conference')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(eventList.getByText('Synthetic family conference')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(eventList.getByText('Synthetic revised conference')).toBeVisible();

  await eventList.getByRole('button', { name: 'Edit' }).click();
  await editor.getByRole('button', { name: 'Delete event' }).click();
  await editor.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(eventList.getByText('Synthetic revised conference')).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(eventList.getByText('Synthetic revised conference')).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);

  await page.reload();
  await expect(eventList.getByText('Synthetic revised conference')).toBeVisible();

  await page.getByRole('link', { name: 'Back to Calendar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar July 2026' })).toBeVisible();
  await expect(page.getByText('Synthetic revised conference')).toBeVisible();
});
