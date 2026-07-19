import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function seedAgenda(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const now = '2026-07-18T12:00:00.000Z';
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          [
            'schoolYears',
            'learnerContexts',
            'learnerNotices',
            'tasks',
            'reminders',
            'calendarEvents',
          ],
          'readwrite',
        );
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();

        transaction.objectStore('schoolYears').put({
          id: 'agenda-year',
          label: 'Synthetic 2026–2027',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          active: true,
        });
        transaction.objectStore('learnerContexts').put({
          id: 'agenda-learner',
          kind: 'individual',
          name: 'Agenda Learner',
          schoolYearId: 'agenda-year',
          status: 'active',
        });

        const notices = [
          {
            id: 'agenda-ongoing-notice',
            contextId: 'agenda-learner',
            kind: 'ongoing-support',
            title: 'Daily reading support',
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'agenda-past-notice',
            contextId: 'agenda-learner',
            kind: 'date-specific-notice',
            title: 'Past learner notice',
            noticeDate: '2026-07-19',
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'agenda-future-notice',
            contextId: 'agenda-learner',
            kind: 'date-specific-notice',
            title: 'Future learner notice',
            noticeDate: '2026-07-23',
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        ];
        for (const notice of notices) transaction.objectStore('learnerNotices').put(notice);

        const tasks = [
          {
            id: 'agenda-overdue-task',
            title: 'Submit overdue form',
            status: 'active',
            dueDate: '2026-07-19',
            dueMinute: 1020,
            order: 1,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'agenda-today-task',
            title: 'Prepare today materials',
            status: 'active',
            scheduledDate: '2026-07-20',
            scheduledMinute: 540,
            dueDate: '2026-07-20',
            dueMinute: 1020,
            order: 2,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'agenda-upcoming-task',
            title: 'Prepare tomorrow materials',
            status: 'active',
            scheduledDate: '2026-07-21',
            scheduledMinute: 600,
            order: 3,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'agenda-waiting-task',
            title: 'Await family response',
            status: 'waiting',
            order: 4,
            createdAt: now,
            updatedAt: now,
            waitingAt: now,
          },
          {
            id: 'agenda-follow-up-task',
            title: 'Follow up: Daily reading support',
            status: 'active',
            linkedEntityType: 'learner-notice',
            linkedEntityId: 'agenda-ongoing-notice',
            contextId: 'agenda-learner',
            order: 5,
            createdAt: now,
            updatedAt: now,
          },
        ];
        for (const task of tasks) transaction.objectStore('tasks').put(task);

        const reminders = [
          {
            id: 'agenda-overdue-reminder',
            sourceType: 'task',
            sourceId: 'agenda-overdue-task',
            remindDate: '2026-07-19',
            remindMinute: 480,
            status: 'active',
            note: 'Past reminder',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'agenda-today-reminder',
            sourceType: 'task',
            sourceId: 'agenda-today-task',
            remindDate: '2026-07-20',
            remindMinute: 510,
            status: 'active',
            note: 'Today reminder',
            createdAt: now,
            updatedAt: now,
          },
        ];
        for (const reminder of reminders) transaction.objectStore('reminders').put(reminder);

        transaction.objectStore('calendarEvents').put({
          id: 'agenda-personal-event',
          title: 'Personal dentist appointment',
          startDate: '2026-07-20',
          startMinute: 780,
          endMinute: 840,
          category: 'Personal',
        });
        transaction.objectStore('calendarEvents').put({
          id: 'agenda-school-event',
          title: 'School staff meeting',
          startDate: '2026-07-20',
          startMinute: 900,
          endMinute: 960,
          category: 'Meeting',
        });
      });
    } finally {
      database.close();
    }
  });
}

test('Personal Agenda aggregates source records without duplication and acts on the originals', async ({
  page,
}) => {
  await page.goto('./#/agenda?date=2026-07-20');
  await seedAgenda(page);
  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Personal Agenda' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Agenda', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const overdue = page.getByRole('region', { name: 'Overdue' });
  const today = page.getByRole('region', { name: 'Today' });
  const upcoming = page.getByRole('region', { name: 'Upcoming' });
  const waiting = page.getByRole('region', { name: 'Waiting' });
  const followUp = page.getByRole('region', { name: 'Unscheduled follow-up' });

  await expect(overdue.getByRole('link', { name: 'Submit overdue form', exact: true })).toHaveCount(
    2,
  );
  await expect(overdue.getByText('Past learner notice')).toBeVisible();
  await expect(overdue.getByText('Past reminder')).toBeVisible();

  await expect(today.getByText('Prepare today materials')).toHaveCount(2);
  await expect(today.getByText('Personal dentist appointment')).toBeVisible();
  await expect(today.getByText('Daily reading support')).toBeVisible();
  await expect(today.getByText('School staff meeting')).toHaveCount(0);

  await expect(upcoming.getByText('Prepare tomorrow materials')).toBeVisible();
  await expect(upcoming.getByText('Future learner notice')).toBeVisible();
  await expect(waiting.getByText('Await family response')).toBeVisible();
  await expect(followUp.getByText('Follow up: Daily reading support')).toBeVisible();

  await page.goto('./#/today?date=2026-07-20');
  const summary = page.getByRole('region', { name: 'Personal Agenda summary' });
  await expect(summary.getByText('3 overdue')).toBeVisible();
  await expect(summary.getByText('4 today')).toBeVisible();
  await expect(summary.getByText('1 waiting')).toBeVisible();
  await summary.getByRole('link', { name: 'Open full Agenda' }).click();

  const todayAfterReturn = page.getByRole('region', { name: 'Today' });
  const todayTask = todayAfterReturn.getByRole('listitem').filter({
    has: page.getByRole('link', { name: 'Prepare today materials', exact: true }),
  });
  await todayTask.getByRole('button', { name: 'Complete' }).click();
  await expect(todayAfterReturn.getByRole('link', { name: 'Prepare today materials' })).toHaveCount(
    1,
  );

  const todayReminder = todayAfterReturn
    .getByRole('listitem')
    .filter({ hasText: 'Today reminder' });
  await todayReminder.getByRole('button', { name: 'Dismiss' }).click();
  await expect(todayAfterReturn.getByText('Today reminder')).toHaveCount(0);

  const ongoingNotice = todayAfterReturn
    .getByRole('listitem')
    .filter({ hasText: 'Daily reading support' });
  await ongoingNotice.getByRole('button', { name: 'Resolve' }).click();
  await expect(todayAfterReturn.getByRole('link', { name: 'Daily reading support' })).toHaveCount(
    0,
  );
  await expect(
    page
      .getByRole('region', { name: 'Unscheduled follow-up' })
      .getByText('Follow up: Daily reading support'),
  ).toBeVisible();

  await waiting.getByRole('button', { name: 'Restore' }).click();
  await expect(
    page.getByRole('region', { name: 'Waiting' }).getByText('No Tasks are waiting.'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Completed' })
      .getByRole('article', { name: 'Prepare today materials task' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Active' })
      .getByRole('article', { name: 'Await family response task' }),
  ).toBeVisible();

  await page.goto('./#/agenda?date=2026-07-20');
  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(
    accessibilityResults.violations,
    accessibilityResults.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('\n'),
  ).toEqual([]);
});
