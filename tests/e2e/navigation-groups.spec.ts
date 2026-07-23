import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('navigation prioritizes daily work and preserves collapsible group choices', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/today?date=2026-07-20');

  const navigation = page.getByRole('complementary', { name: 'Primary navigation' });
  const resources = navigation.getByRole('button', { name: 'Resources' });
  const reflect = navigation.getByRole('button', { name: 'Reflect' });
  const settingsData = navigation.getByRole('button', { name: 'Settings & Data' });

  await expect(navigation.getByRole('link', { name: 'Learners', exact: true })).toBeVisible();
  await expect(resources).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation.getByRole('link', { name: 'Library', exact: true })).toBeVisible();
  await expect(reflect).toHaveAttribute('aria-expanded', 'false');
  await expect(navigation.getByRole('link', { name: 'Teaching Insights' })).toBeHidden();
  await expect(settingsData).toHaveAttribute('aria-expanded', 'false');
  await expect(navigation.getByRole('link', { name: 'Import Center' })).toBeHidden();

  await reflect.click();
  await expect(reflect).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation.getByRole('link', { name: 'Teaching Insights' })).toBeVisible();
  await page.reload();
  await expect(navigation.getByRole('button', { name: 'Reflect' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  await navigation.getByRole('button', { name: 'Reflect' }).click();
  await expect(navigation.getByRole('link', { name: 'Teaching Insights' })).toBeHidden();

  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(navigation.getByRole('link', { name: 'Teaching Insights' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Import Center' })).toBeVisible();

  await page.getByRole('button', { name: 'Expand navigation' }).click();
  await expect(navigation.getByRole('link', { name: 'Teaching Insights' })).toBeHidden();
  await expect(navigation.getByRole('link', { name: 'Import Center' })).toBeHidden();

  await page.goto('./#/insights');
  await expect(navigation.getByRole('button', { name: 'Reflect' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(navigation.getByRole('link', { name: 'Teaching Insights' })).toBeVisible();
  await expect(page.locator('main').getByText('Reflect', { exact: true })).toBeVisible();
});

test('mobile drawer keeps the same hierarchy and opens the active route group', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/today?date=2026-07-20');

  await page.getByRole('button', { name: 'Open navigation' }).click();
  const navigation = page.getByRole('complementary', { name: 'Primary navigation' });
  const resources = navigation.getByRole('button', { name: 'Resources' });

  await expect(resources).toHaveAttribute('aria-expanded', 'true');
  await resources.click();
  await expect(resources).toHaveAttribute('aria-expanded', 'false');
  await expect(navigation.getByRole('link', { name: 'Library', exact: true })).toBeHidden();

  await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(navigation.getByRole('button', { name: 'Resources' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await page.goto('./#/library');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(navigation.getByRole('button', { name: 'Resources' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(navigation.getByRole('link', { name: 'Library', exact: true })).toBeVisible();
  await expect(
    page.locator('main').getByRole('heading', { level: 1, name: 'Library' }),
  ).toBeVisible();

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
});
