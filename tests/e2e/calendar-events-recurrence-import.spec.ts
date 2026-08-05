import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const schoolYear = {
  id: 'recurrence-import-year',
  label: 'Recurrence Import 2026–2027',
  startsOn: '2026-08-24',
  endsOn: '2027-06-18',
  active: true,
  lifecycleState: 'active',
};

const defaultEventType = {
  id: 'recurrence-event-type-default',
  familyId: 'calendar-event-type',
  name: 'Calendar',
  normalizedName: 'calendar',
  aliases: [],
  normalizedAliases: [],
  sortOrder: 0,
  isDefault: true,
  lifecycleState: 'active',
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
};

async function waitForSchema(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const databases = await page.evaluate(() => indexedDB.databases());
      return databases.some(
        (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 16,
      );
    })
    .toBe(true);
}

async function seed(page: Page): Promise<void> {
  await waitForSchema(page);
  await page.evaluate(
    async ({ year, eventType }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('classroom-v20');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const stores = [
            'schoolYears',
            'calendarEvents',
            'calendarEventImportSeries',
            'calendarEventImportOccurrences',
            'categoryValues',
            'categoryAssignments',
            'classificationMappingPresets',
            'importRuns',
            'changeLog',
            'scheduleBlocks',
            'scheduleExceptions',
            'sessionOccurrences',
            'reminders',
          ];
          const transaction = database.transaction(stores, 'readwrite');
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
          transaction.oncomplete = () => resolve();
          for (const store of stores) transaction.objectStore(store).clear();
          transaction.objectStore('schoolYears').put(year);
          transaction.objectStore('categoryValues').put(eventType);
        });
      } finally {
        database.close();
      }
    },
    { year: schoolYear, eventType: defaultEventType },
  );
}

async function state(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const stores = [
        'calendarEvents',
        'calendarEventImportSeries',
        'calendarEventImportOccurrences',
        'importRuns',
        'scheduleBlocks',
        'scheduleExceptions',
        'sessionOccurrences',
        'reminders',
      ];
      const transaction = database.transaction(stores, 'readonly');
      const all = <T>(name: string) =>
        new Promise<T[]>((resolve, reject) => {
          const request = transaction.objectStore(name).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result as T[]);
        });
      const [events, series, occurrences, runs, blocks, exceptions, sessions, reminders] =
        await Promise.all([
          all<Record<string, unknown>>('calendarEvents'),
          all<Record<string, unknown>>('calendarEventImportSeries'),
          all<Record<string, unknown>>('calendarEventImportOccurrences'),
          all<Record<string, unknown>>('importRuns'),
          all<Record<string, unknown>>('scheduleBlocks'),
          all<Record<string, unknown>>('scheduleExceptions'),
          all<Record<string, unknown>>('sessionOccurrences'),
          all<Record<string, unknown>>('reminders'),
        ]);
      const sortedEvents = [...events].sort(
        (first, second) =>
          String(first.startDate ?? '').localeCompare(String(second.startDate ?? '')) ||
          String(first.startMinute ?? '').localeCompare(String(second.startMinute ?? '')) ||
          String(first.title ?? '').localeCompare(String(second.title ?? '')) ||
          String(first.id ?? '').localeCompare(String(second.id ?? '')),
      );
      const sortedOccurrences = [...occurrences].sort(
        (first, second) =>
          String(first.occurrenceKey ?? '').localeCompare(String(second.occurrenceKey ?? '')) ||
          String(first.id ?? '').localeCompare(String(second.id ?? '')),
      );

      return {
        events: sortedEvents,
        series,
        occurrences: sortedOccurrences,
        runs: runs.filter((run) => run.importType === 'calendar-events'),
        adjacentCounts: [blocks.length, exceptions.length, sessions.length, reminders.length],
      };
    } finally {
      database.close();
    }
  });
}

function recurrenceIcs(count = 4): Buffer {
  return Buffer.from(
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Synthetic District//Recurrence Test//EN',
      'BEGIN:VEVENT',
      'UID:District-Weekly-2026',
      'SUMMARY:District weekly event',
      'DTSTART;VALUE=DATE:20261001',
      'DTEND;VALUE=DATE:20261003',
      `RRULE:FREQ=WEEKLY;COUNT=${count};BYDAY=TH`,
      ...(count === 4 ? ['RDATE;VALUE=DATE:20261030', 'EXDATE;VALUE=DATE:20261015'] : []),
      'END:VEVENT',
      ...(count === 4
        ? [
            'BEGIN:VEVENT',
            'UID:District-Weekly-2026',
            'RECURRENCE-ID;VALUE=DATE:20261008',
            'STATUS:CANCELLED',
            'END:VEVENT',
            'BEGIN:VEVENT',
            'UID:District-Weekly-2026',
            'RECURRENCE-ID;VALUE=DATE:20261022',
            'SUMMARY:Moved district weekly event',
            'DTSTART;VALUE=DATE:20261023',
            'END:VEVENT',
          ]
        : []),
      'END:VCALENDAR',
    ].join('\r\n'),
  );
}

async function chooseFile(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.getByLabel('Choose Calendar Events import file').setInputFiles({
    name,
    mimeType: 'text/calendar',
    buffer,
  });
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
}

async function commitPreview(page: Page): Promise<void> {
  const updateConfirmation = page.getByLabel('Confirm the reviewed Calendar Event updates.');
  if (await updateConfirmation.isVisible()) await updateConfirmation.check();
  const removalConfirmation = page.getByLabel('Confirm the reviewed Calendar Event removals.');
  if (await removalConfirmation.isVisible()) await removalConfirmation.check();
  await page.getByLabel('Commit the complete reviewed Calendar Event preview.').check();
  await page.getByRole('button', { name: 'Commit reviewed Calendar Events' }).click();
}

test('recurrence preview is no-write, commits eligible discrete Events, exact re-import is a no-op, and Undo/Redo stays atomic', async ({
  page,
}) => {
  await page.goto('./#/import?type=calendar-events');
  await seed(page);
  await page.reload();

  await chooseFile(page, 'district-recurring.ics', recurrenceIcs());
  const preview = page.getByLabel('Calendar Event import preview');
  await expect(preview.getByText('Create', { exact: true })).toHaveCount(3);
  await expect(preview.getByText('Update', { exact: true })).toHaveCount(2);
  await expect
    .poll(() => state(page))
    .toMatchObject({
      events: [],
      series: [],
      occurrences: [],
      runs: [],
      adjacentCounts: [0, 0, 0, 0],
    });

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await commitPreview(page);
  await expect(page.getByText(/Committed 3 new and 0 updated Calendar Events/)).toBeVisible();
  await expect
    .poll(() => state(page))
    .toMatchObject({
      events: [
        expect.objectContaining({ startDate: '2026-10-01', endDate: '2026-10-02' }),
        expect.objectContaining({
          title: 'Moved district weekly event',
          startDate: '2026-10-23',
          endDate: '2026-10-24',
        }),
        expect.objectContaining({ startDate: '2026-10-30', endDate: '2026-10-31' }),
      ],
      series: [expect.objectContaining({ externalKey: 'District-Weekly-2026' })],
      occurrences: expect.arrayContaining([
        expect.objectContaining({ sourceStatus: 'cancelled', managementStatus: 'suppressed' }),
        expect.objectContaining({ sourceStatus: 'excluded', managementStatus: 'suppressed' }),
      ]),
      adjacentCounts: [0, 0, 0, 0],
    });

  await page.getByRole('link', { name: 'Open Calendar' }).click();
  await expect(page).toHaveURL(/#\/calendar\?date=2026-10-01$/);
  await expect(page.getByText('District weekly event', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(() => state(page))
    .toMatchObject({
      events: [],
      series: [],
      occurrences: [],
      runs: [],
    });

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect
    .poll(() => state(page))
    .toMatchObject({
      events: [expect.any(Object), expect.any(Object), expect.any(Object)],
      series: [expect.any(Object)],
      occurrences: [
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      ],
      runs: [expect.any(Object)],
      adjacentCounts: [0, 0, 0, 0],
    });

  await page.goto('./#/import?type=calendar-events');
  await chooseFile(page, 'district-recurring.ics', recurrenceIcs());

  const reimportPreview = page.getByLabel('Calendar Event import preview');
  await expect(reimportPreview.getByText('Skip', { exact: true })).toHaveCount(5);
  await expect(
    page.getByRole('button', { name: 'Commit reviewed Calendar Events' }),
  ).toBeDisabled();

  await expect
    .poll(() => state(page))
    .toMatchObject({
      events: [expect.any(Object), expect.any(Object), expect.any(Object)],
      series: [expect.any(Object)],
      occurrences: [
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      ],
      runs: [expect.any(Object)],
      adjacentCounts: [0, 0, 0, 0],
    });
});

test('source removal requires explicit confirmation and one Undo restores the Event and occurrence ownership', async ({
  page,
}) => {
  await page.goto('./#/import?type=calendar-events');
  await seed(page);
  await page.reload();

  await chooseFile(page, 'weekly-two.ics', recurrenceIcs(2));
  await commitPreview(page);
  await expect
    .poll(() => state(page))
    .toMatchObject({
      events: [expect.any(Object), expect.any(Object)],
      occurrences: [expect.any(Object), expect.any(Object)],
    });

  await chooseFile(page, 'weekly-one.ics', recurrenceIcs(1));
  const preview = page.getByLabel('Calendar Event import preview');
  await expect(preview.getByText('Remove', { exact: true })).toHaveCount(1);
  await expect
    .poll(() => state(page))
    .toMatchObject({
      events: [expect.any(Object), expect.any(Object)],
    });
  await page.getByLabel('Confirm the reviewed Calendar Event updates.').check();
  await page.getByLabel('Commit the complete reviewed Calendar Event preview.').check();
  await expect(
    page.getByRole('button', { name: 'Commit reviewed Calendar Events' }),
  ).toBeDisabled();
  await page.getByLabel('Confirm the reviewed Calendar Event removals.').check();
  await page.getByRole('button', { name: 'Commit reviewed Calendar Events' }).click();

  await expect
    .poll(() => state(page))
    .toMatchObject({
      events: [expect.any(Object)],
      occurrences: [expect.any(Object), expect.objectContaining({ sourceStatus: 'absent' })],
      adjacentCounts: [0, 0, 0, 0],
    });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(() => state(page))
    .toMatchObject({
      events: [expect.any(Object), expect.any(Object)],
      occurrences: [expect.any(Object), expect.any(Object)],
    });
});

test('manual edits and deletions open explicit recurrence review, while unsupported recurrence and unresolved TZID write nothing', async ({
  page,
}) => {
  await page.goto('./#/import?type=calendar-events');
  await seed(page);
  await page.reload();
  await chooseFile(page, 'weekly-two.ics', recurrenceIcs(2));
  await commitPreview(page);

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const transaction = database.transaction(
        ['calendarEvents', 'calendarEventImportOccurrences'],
        'readwrite',
      );
      const eventsRequest = transaction.objectStore('calendarEvents').getAll();
      const occurrencesRequest = transaction.objectStore('calendarEventImportOccurrences').getAll();
      const [events, occurrences] = await Promise.all([
        new Promise<Record<string, unknown>[]>((resolve, reject) => {
          eventsRequest.onerror = () => reject(eventsRequest.error);
          eventsRequest.onsuccess = () =>
            resolve(eventsRequest.result as Record<string, unknown>[]);
        }),
        new Promise<Record<string, unknown>[]>((resolve, reject) => {
          occurrencesRequest.onerror = () => reject(occurrencesRequest.error);
          occurrencesRequest.onsuccess = () =>
            resolve(occurrencesRequest.result as Record<string, unknown>[]);
        }),
      ]);
      const first = events[0]!;
      transaction.objectStore('calendarEvents').put({ ...first, title: 'Locally edited event' });
      const secondOccurrence = occurrences.find(
        (value) => value.eventId && value.eventId !== first.id,
      );
      if (secondOccurrence?.eventId) {
        transaction.objectStore('calendarEvents').delete(secondOccurrence.eventId as IDBValidKey);
      }
      await new Promise<void>((resolve, reject) => {
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
      });
    } finally {
      database.close();
    }
  });

  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await expect(
    page.getByLabel('Calendar Event import preview').getByText('Review', { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByRole('option', { name: 'Apply source values' })).toBeAttached();
  await expect(page.getByRole('option', { name: 'Keep deleted' })).toBeAttached();

  await page.getByLabel('Choose Calendar Events import file').setInputFiles({
    name: 'unsupported.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Synthetic District//Blocked Recurrence//EN',
        'BEGIN:VEVENT',
        'UID:blocked-hourly',
        'SUMMARY:Blocked hourly recurrence',
        'DTSTART;TZID=America/New_York:20261001T090000',
        'DTEND;TZID=America/New_York:20261001T093000',
        'RRULE:FREQ=HOURLY;COUNT=2',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    ),
  });
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();
  await expect(
    page.getByLabel('Calendar Event import preview').getByText('Blocked', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/FREQ=HOURLY/)).toBeVisible();
  await expect(
    page
      .getByLabel('Calendar Event import preview')
      .getByText('TZID America/New_York requires a matching VTIMEZONE definition.', {
        exact: true,
      }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Commit reviewed Calendar Events' }),
  ).toBeDisabled();
});
