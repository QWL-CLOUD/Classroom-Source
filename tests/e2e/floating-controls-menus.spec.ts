import { expect, test } from '@playwright/test';

test('shared add menus stay viewport-bounded and dismiss predictably', async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 460 });
  await page.goto('./#/today?date=2026-07-22');

  const topbar = page.getByRole('banner');
  await expect(topbar).toBeVisible();

  const topbarAlpha = await topbar.evaluate((element) => {
    const color = getComputedStyle(element).backgroundColor;
    const rgba = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)$/);
    return rgba ? Number(rgba[1]) : 1;
  });
  expect(topbarAlpha).toBe(1);

  const addTrigger = page.getByLabel('Add to 2026-07-22');
  const addMenu = page.getByRole('navigation', { name: 'Add items for 2026-07-22' });

  await addTrigger.click();
  await expect(addMenu).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  await expect
    .poll(async () => {
      const menuBox = await addMenu.boundingBox();
      if (!menuBox || !viewport) return false;

      return (
        menuBox.x >= 8 &&
        menuBox.y >= 8 &&
        menuBox.x + menuBox.width <= viewport.width - 8 &&
        menuBox.y + menuBox.height <= viewport.height - 8
      );
    })
    .toBe(true);

  await page.locator('main').click({ position: { x: 6, y: 6 } });
  await expect(addMenu).toBeHidden();

  await addTrigger.click();
  await addTrigger.press('Escape');
  await expect(addMenu).toBeHidden();
  await expect(addTrigger).toBeFocused();
});
