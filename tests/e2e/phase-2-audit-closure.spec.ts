import { expect, test } from '@playwright/test';

test('Calendar exposes event management and preserves the selected date', async ({ page }) => {
  await page.goto('./#/calendar?date=2026-07-20');

  await expect(page.getByRole('heading', { level: 1, name: 'Calendar July 2026' })).toBeVisible();

  const manageEvents = page.getByRole('link', { name: 'Manage events' });
  await expect(manageEvents).toBeVisible();
  await expect(manageEvents).toHaveAttribute('href', '#/calendar/edit?date=2026-07-20');

  await manageEvents.click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Calendar event editor' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/calendar\/edit\?date=2026-07-20$/);

  await page.getByRole('link', { name: 'Back to Calendar' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Calendar July 2026' })).toBeVisible();
  await expect(page).toHaveURL(/#\/calendar\?date=2026-07-20$/);
});
