import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('core routes use browser history and survive reload', async ({ page }) => {
  await page.goto('./#/today?date=2026-07-14');
  await expect(page.getByRole('heading', { level: 1, name: /^Good/ })).toBeVisible();

  await page.getByRole('link', { name: 'Week' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Week/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /^Week/ })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: /^Good/ })).toBeVisible();

  await page.goForward();
  await expect(page.getByRole('heading', { level: 1, name: /^Week/ })).toBeVisible();
});

test('Week controls can be changed repeatedly without losing the route', async ({ page }) => {
  await page.goto('./#/week?date=2026-07-13');

  const weekends = page.getByRole('checkbox', { name: 'Weekends' });
  await expect(weekends).toBeVisible();

  for (let index = 0; index < 20; index += 1) {
    await weekends.click();
  }

  await expect(page).toHaveURL(/#\/week\?date=2026-07-13$/);
});

test('foundation pages have no automatically detectable accessibility violations', async ({
  page,
}) => {
  await page.goto('./#/today?date=2026-07-14');

  await expect(page.getByRole('heading', { level: 1, name: /^Good/ })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();

  expect(
    results.violations,
    results.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});
