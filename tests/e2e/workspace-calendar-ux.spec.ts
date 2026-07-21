import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seedWorkspaceUx(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['schoolYears', 'learnerContexts', 'scheduleBlocks', 'calendarEvents'],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        transaction.objectStore('schoolYears').put({
          id: 'phase-3d-5b-2-year',
          label: 'Synthetic 2026–2027',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          active: true,
        });
        transaction.objectStore('learnerContexts').put({
          id: 'phase-3d-5b-2-class',
          kind: 'class',
          name: 'Synthetic UX class',
          schoolYearId: 'phase-3d-5b-2-year',
          status: 'active',
        });
        transaction.objectStore('scheduleBlocks').put({
          id: 'phase-3d-5b-2-block',
          contextId: 'phase-3d-5b-2-class',
          title: 'Synthetic UX lesson block',
          subject: 'Chinese',
          category: 'Teaching',
          kind: 'teachable',
          weekdays: [1, 2, 3, 4, 5],
          startMinute: 540,
          endMinute: 600,
          effectiveFrom: '2026-07-01',
          effectiveTo: '2027-06-30',
          planningEnabled: true,
          bumpEnabled: true,
          showInWeek: true,
          sortOrder: 1,
        });
        transaction.objectStore('calendarEvents').put({
          id: 'phase-3d-5b-2-event',
          title: 'Synthetic UX staff event',
          startDate: '2026-07-20',
          startMinute: 630,
          endMinute: 690,
          category: 'Meeting',
        });
      });
    } finally {
      database.close();
    }
  });
}

test('Today prioritizes the schedule and uses one date-aware Add menu', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-07-20T16:00:00.000Z'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./#/today?date=2026-07-20');
  await seedWorkspaceUx(page);
  await page.reload();

  const greeting = page.getByRole('heading', { level: 1, name: /Alyssa\.$/ });
  const addButton = page.locator('summary[aria-label="Add to 2026-07-20"]');
  const previousDayButton = page.getByRole('button', { name: /Previous day/ });
  await expect(page.getByText('Today · Monday, July 20, 2026', { exact: true })).toBeVisible();

  const [greetingBox, addButtonBox, previousDayBox] = await Promise.all([
    greeting.boundingBox(),
    addButton.boundingBox(),
    previousDayButton.boundingBox(),
  ]);
  if (!greetingBox || !addButtonBox || !previousDayBox) {
    throw new Error('Today header geometry could not be measured.');
  }
  expect(greetingBox.height).toBeLessThan(80);
  expect(addButtonBox.y).toBeLessThan(previousDayBox.y);
  await expect(page.getByRole('button', { name: 'Undo' })).toContainText('Undo');
  await expect(page.getByRole('button', { name: 'Redo' })).toContainText('Redo');

  await page.setViewportSize({ width: 390, height: 844 });

  const schedule = page.getByRole('region', { name: 'Schedule for Monday, July 20, 2026' });
  await expect(schedule.getByRole('heading', { level: 2, name: 'Today schedule' })).toBeVisible();
  await expect(schedule.getByText('Monday, July 20, 2026', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Selected date')).toHaveValue('2026-07-20');

  const toDo = page.getByRole('heading', { name: 'To-do' });
  const [scheduleBox, toDoBox] = await Promise.all([schedule.boundingBox(), toDo.boundingBox()]);
  if (!scheduleBox || !toDoBox) throw new Error('Today mobile geometry could not be measured.');
  expect(scheduleBox.y).toBeLessThan(toDoBox.y);

  await expect(page.getByText('Quick capture')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New plan', exact: true })).toHaveCount(0);

  await addButton.click();
  const addItems = page.getByRole('navigation', { name: 'Add items for 2026-07-20' });
  await expect(addItems.getByRole('link', { name: /New plan/ })).toBeVisible();
  await expect(addItems.getByRole('link', { name: /New event/ })).toBeVisible();
  await expect(addItems.getByRole('link', { name: /New task/ })).toBeVisible();
  await expect(addItems.getByRole('link', { name: /Learner notice/ })).toBeVisible();

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

test('Week names the day action and mobile Calendar stays compact until expanded', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-07-20T16:00:00.000Z'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/week?date=2026-07-20&view=everything');
  await seedWorkspaceUx(page);
  await page.reload();

  const monday = page.locator('[data-date="2026-07-20"]');
  const mondayHeading = monday.getByRole('heading', { level: 2, name: 'Monday' });
  await expect(mondayHeading).toBeVisible();
  const todayLabel = monday.getByText('Today', { exact: true });
  const mondayDate = monday.getByText('Jul 20', { exact: true });
  await expect(todayLabel).toBeVisible();

  const [todayLabelBox, mondayDateBox, mondayHeadingBox] = await Promise.all([
    todayLabel.boundingBox(),
    mondayDate.boundingBox(),
    mondayHeading.boundingBox(),
  ]);
  if (!todayLabelBox || !mondayDateBox || !mondayHeadingBox) {
    throw new Error('Week day-header geometry could not be measured.');
  }
  expect(Math.abs(todayLabelBox.y - mondayDateBox.y)).toBeLessThan(8);
  expect(todayLabelBox.y).toBeGreaterThan(mondayHeadingBox.y);

  const mondayHeadingLayout = await mondayHeading.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      overflowWrap: styles.overflowWrap,
      whiteSpace: styles.whiteSpace,
      wordBreak: styles.wordBreak,
    };
  });
  expect(mondayHeadingLayout).toMatchObject({
    overflowWrap: 'normal',
    whiteSpace: 'nowrap',
    wordBreak: 'normal',
  });
  expect(mondayHeadingLayout.height).toBeLessThan(40);

  const wednesdayHeading = page
    .locator('[data-date="2026-07-22"]')
    .getByRole('heading', { level: 2, name: 'Wednesday' });
  await expect(wednesdayHeading).toBeVisible();
  await expect(wednesdayHeading).toHaveCSS('white-space', 'nowrap');
  const wednesdayHeadingBox = await wednesdayHeading.boundingBox();
  if (!wednesdayHeadingBox) throw new Error('Wednesday heading geometry could not be measured.');
  expect(wednesdayHeadingBox.height).toBeLessThan(40);

  await expect(monday.getByRole('link', { name: /Add lesson plan to Monday/ })).toContainText(
    'Add plan',
  );

  await page.goto('./#/calendar?date=2026-07-20');
  const calendar = page.getByRole('region', { name: 'July 2026 calendar' });
  await expect(calendar).toBeVisible();

  const weekDetails = calendar.locator('details[data-week]');
  await expect(weekDetails).toHaveCount(5);
  const currentWeek = calendar.locator('details[data-week="2026-07-20"]');
  await expect(currentWeek).toHaveAttribute('open', '');
  await expect(currentWeek.getByText('Jul 20–26, 2026', { exact: true })).toBeVisible();
  await expect(
    currentWeek.getByText('Current week · Selected week', { exact: true }),
  ).toBeVisible();
  await expect(calendar.getByRole('article')).toHaveCount(7);

  const currentWeekBox = await currentWeek.boundingBox();
  if (!currentWeekBox) throw new Error('Current Calendar week geometry could not be measured.');
  expect(currentWeekBox.y).toBeGreaterThanOrEqual(0);
  expect(currentWeekBox.y).toBeLessThan(320);

  const mondayHighlights = calendar.getByRole('list', {
    name: 'Highlights for Monday, July 20, 2026',
  });
  await expect(mondayHighlights.getByText('Synthetic UX staff event')).toBeVisible();
  await expect(mondayHighlights.getByText('Synthetic UX lesson block')).toHaveCount(0);

  const mondayCard = calendar.getByRole('article', {
    name: /Monday, July 20, 2026/,
  });
  await expect(mondayCard.getByText('1 schedule', { exact: true })).toBeVisible();
  const scheduleDetails = mondayCard.getByText('Show 1 recurring schedule block', {
    exact: true,
  });
  await expect(scheduleDetails).toBeVisible();
  await expect(
    page.locator('[data-calendar-item="schedule-block:phase-3d-5b-2-block:2026-07-20"]'),
  ).toBeHidden();
  await scheduleDetails.click();
  await expect(
    page.locator('[data-calendar-item="schedule-block:phase-3d-5b-2-block:2026-07-20"]'),
  ).toBeVisible();

  const tuesdayCard = calendar.getByRole('article', {
    name: /Tuesday, July 21, 2026/,
  });
  await tuesdayCard.getByRole('button', { name: 'Select Tuesday, July 21, 2026' }).click();
  await expect(page).toHaveURL(/#\/calendar\?date=2026-07-21$/);
  await expect(
    tuesdayCard.getByRole('button', { name: 'Select Tuesday, July 21, 2026' }),
  ).toHaveAttribute('aria-pressed', 'true');

  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(pageHeight).toBeLessThan(3600);
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
