import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seedCalendarFoundation(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['schoolYears', 'categoryValues'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        transaction.objectStore('schoolYears').put({
          id: 'calendar-year',
          label: '2026–2027',
          startsOn: '2026-08-24',
          endsOn: '2027-06-14',
          active: true,
          lifecycleState: 'active',
        });
        transaction.objectStore('categoryValues').put({
          id: 'event-type-conference',
          familyId: 'calendar-event-type',
          name: 'Parent Conference',
          normalizedName: 'parent conference',
          aliases: [],
          normalizedAliases: [],
          sortOrder: 0,
          isDefault: false,
          lifecycleState: 'active',
          createdAt: '2026-08-04T12:00:00.000Z',
          updatedAt: '2026-08-04T12:00:00.000Z',
        });
      });
    } finally {
      database.close();
    }
  });
}

test('Calendar event editing is year-owned, canonically classified, transactional, and undoable', async ({
  page,
}) => {
  await page.goto('./#/calendar/edit?date=2026-07-20');
  await seedCalendarFoundation(page);
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Calendar event editor' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'New event' }).click();
  const editor = page.getByRole('region', { name: 'Calendar event editor' });
  await expect(editor).toBeVisible();

  await editor.getByLabel('Title').fill('Synthetic family conference');
  await editor.getByLabel('School year').selectOption('calendar-year');
  await editor.getByLabel('Calendar Event Type').selectOption('event-type-conference');
  await editor.getByLabel('All-day event').uncheck();
  await editor.getByLabel('Start time').fill('13:15');
  await editor.getByLabel('End time').fill('14:00');
  await editor.getByLabel('Location').fill('Room 204');
  await editor.getByLabel('Time zone').fill('America/New_York');
  await editor.getByLabel('Details').fill('Synthetic browser validation record.');
  await editor.getByRole('button', { name: 'Save event' }).click();

  const eventList = page.getByRole('list', {
    name: 'July 2026 calendar events',
  });
  const eventItem = eventList.getByText('Synthetic family conference');
  await expect(eventItem).toBeVisible();
  await expect(eventList).toContainText('Parent Conference');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

  await eventList.getByRole('button', { name: 'Edit' }).click();
  await expect(editor.getByLabel('School year')).toHaveValue('calendar-year');
  await expect(editor.getByLabel('Calendar Event Type')).toHaveValue('event-type-conference');
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

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
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
  await expect(
    page.getByLabel(/Highlights for Monday, July 20/).getByText('Synthetic revised conference'),
  ).toBeVisible();
});
