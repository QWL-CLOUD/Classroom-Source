import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('global shell uses a mobile navigation drawer and route-aware content widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/today?date=2026-07-20');

  const mobileMenu = page.getByRole('button', { name: 'Open navigation' });
  const primaryNavigation = page.getByRole('complementary', { name: 'Primary navigation' });

  await expect(mobileMenu).toBeVisible();
  await expect(primaryNavigation).toBeHidden();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.locator('main[data-content-layout="standard"]')).toBeVisible();

  await mobileMenu.click();
  await expect(primaryNavigation).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeFocused();

  const drawerAccessibility = await new AxeBuilder({ page }).analyze();
  expect(
    drawerAccessibility.violations,
    drawerAccessibility.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);

  await primaryNavigation.getByRole('link', { name: 'Week', exact: true }).click();
  await expect(page).toHaveURL(/#\/week/);
  await expect(primaryNavigation).toBeHidden();
  await expect(page.locator('main[data-content-layout="wide"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /^Week/ })).toBeVisible();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});

test('editor actions remain available through the shared sticky action bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/schedule/edit?date=2026-07-20');

  const actions = page.getByRole('group', { name: 'Editor actions' });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Save block' })).toBeVisible();
  await expect(actions).toHaveCSS('position', 'sticky');
  await expect(page.locator('main[data-content-layout="editor"]')).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
