import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const schoolYear = {
  id: 'calendar-import-year',
  label: 'Calendar Import 2026–2027',
  startsOn: '2026-08-24',
  endsOn: '2027-06-18',
  active: true,
  lifecycleState: 'active',
};

const defaultEventType = {
  id: 'calendar-event-type-default',
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
        (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 15,
      );
    })
    .toBe(true);
}

async function seedCalendarImport(page: Page): Promise<void> {
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

async function readCalendarImportState(page: Page, title: string, secondaryTitle?: string) {
  return page.evaluate(
    async ({ expectedTitle, expectedSecondaryTitle }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('classroom-v20');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        const stores = [
          'calendarEvents',
          'categoryAssignments',
          'importRuns',
          'scheduleBlocks',
          'scheduleExceptions',
          'sessionOccurrences',
          'reminders',
        ];
        const transaction = database.transaction(stores, 'readonly');
        const all = <T>(store: string) =>
          new Promise<T[]>((resolve, reject) => {
            const request = transaction.objectStore(store).getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result as T[]);
          });
        const [events, assignments, runs, blocks, exceptions, sessions, reminders] =
          await Promise.all([
            all<Record<string, unknown>>('calendarEvents'),
            all<Record<string, unknown>>('categoryAssignments'),
            all<Record<string, unknown>>('importRuns'),
            all<Record<string, unknown>>('scheduleBlocks'),
            all<Record<string, unknown>>('scheduleExceptions'),
            all<Record<string, unknown>>('sessionOccurrences'),
            all<Record<string, unknown>>('reminders'),
          ]);
        const event = events.find((candidate) => candidate.title === expectedTitle);
        const secondaryEvent = expectedSecondaryTitle
          ? events.find((candidate) => candidate.title === expectedSecondaryTitle)
          : undefined;
        return {
          event,
          secondaryEvent,
          eventCount: events.length,
          assignment: assignments.find(
            (candidate) =>
              candidate.entityType === 'calendar-event' && candidate.entityId === event?.id,
          ),
          calendarRuns: runs.filter((run) => run.importType === 'calendar-events'),
          scheduleBlockCount: blocks.length,
          scheduleExceptionCount: exceptions.length,
          sessionCount: sessions.length,
          reminderCount: reminders.length,
        };
      } finally {
        database.close();
      }
    },
    { expectedTitle: title, expectedSecondaryTitle: secondaryTitle },
  );
}

test('Calendar Events import offers formal Excel and CSV templates', async ({ page }) => {
  await page.goto('./#/import?type=calendar-events');
  await waitForSchema(page);
  await expect(page.getByRole('heading', { name: 'Import Calendar Events' })).toBeVisible();

  const xlsxDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel template' }).click();
  expect((await xlsxDownloadPromise).suggestedFilename()).toBe(
    'Classroom-Calendar-Events-Import-Template.xlsx',
  );

  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV template' }).click();
  expect((await csvDownloadPromise).suggestedFilename()).toBe(
    'Classroom-Calendar-Events-Import-Template.csv',
  );
});

test('recurring ICS Event with unresolved TZID stays blocked and writes nothing', async ({
  page,
}) => {
  const title = 'Recurring faculty meeting';
  await page.goto('./#/import?type=calendar-events');
  await seedCalendarImport(page);
  await page.reload();

  await page.getByLabel('Choose Calendar Events import file').setInputFiles({
    name: 'recurring-calendar.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Synthetic District//Calendar Test//EN',
        'BEGIN:VEVENT',
        'UID:Recurring-Faculty-Meeting',
        `SUMMARY:${title}`,
        'DTSTART;TZID=America/New_York:20261013T153000',
        'DTEND;TZID=America/New_York:20261013T161500',
        'RRULE:FREQ=WEEKLY',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    ),
  });
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  const preview = page.getByLabel('Calendar Event import preview');
  await expect(preview.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(
    preview.getByText('TZID America/New_York requires a matching VTIMEZONE definition.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Commit reviewed Calendar Events' }),
  ).toBeDisabled();
  await expect
    .poll(() => readCalendarImportState(page, title))
    .toMatchObject({ event: undefined, eventCount: 0, calendarRuns: [] });
});

test('reviewed ICS import is no-write until commit, preserves Calendar semantics, and globally undoes', async ({
  page,
}) => {
  const title = 'Tentative professional learning day';
  const timedTitle = 'Timed district planning meeting';
  await page.goto('./#/import?type=calendar-events');
  await seedCalendarImport(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Import Calendar Events' })).toBeVisible();
  await expect(page.getByLabel('Active School Year')).toHaveValue(schoolYear.id);

  await page.getByLabel('Choose Calendar Events import file').setInputFiles({
    name: 'district-calendar.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Synthetic District//Calendar Test//EN',
        'BEGIN:VEVENT',
        'UID:District-PD-2026-01',
        `SUMMARY:${title}`,
        'DESCRIPTION:Reviewed district event',
        'LOCATION:Main campus',
        'DTSTART;VALUE=DATE:20261012',
        'DTEND;VALUE=DATE:20261013',
        'STATUS:TENTATIVE',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        'END:VALARM',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:District-Meeting-2026-01',
        `SUMMARY:${timedTitle}`,
        'DESCRIPTION:Timed wall-time event',
        'LOCATION:Conference room',
        'DTSTART;TZID=America/New_York:20261012T153000',
        'DTEND;TZID=America/New_York:20261012T161500',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    ),
  });
  await expect(page.getByText(/VALARM was ignored/)).toBeVisible();
  await page.getByRole('button', { name: 'Generate reviewed preview' }).click();

  await expect(
    page.getByLabel('Calendar Event import preview').getByText('Review', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => readCalendarImportState(page, title, timedTitle))
    .toMatchObject({
      event: undefined,
      secondaryEvent: undefined,
      eventCount: 0,
      calendarRuns: [],
      scheduleBlockCount: 0,
      scheduleExceptionCount: 0,
      sessionCount: 0,
      reminderCount: 0,
    });

  await page.getByLabel(`Import ${title} as a normal Event despite STATUS:TENTATIVE.`).check();
  await page.getByRole('button', { name: 'Regenerate reviewed preview' }).click();
  const createClassifications = page
    .getByLabel('Calendar Event import preview')
    .getByText('Create', { exact: true });

  await expect(createClassifications).toHaveCount(2);
  await expect(createClassifications.first()).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByLabel('Commit the complete reviewed Calendar Event preview.').check();
  await page.getByRole('button', { name: 'Commit reviewed Calendar Events' }).click();
  await expect(page.getByText(/Committed 2 new and 0 updated Calendar Events/)).toBeVisible();

  await expect
    .poll(() => readCalendarImportState(page, title, timedTitle))
    .toMatchObject({
      event: {
        title,
        startDate: '2026-10-12',
        endDate: '2026-10-12',
        schoolYearId: schoolYear.id,
        location: 'Main campus',
        externalSource: 'ics',
        externalKey: 'District-PD-2026-01',
        importIdentityKey: 'calendar-event\u0000ics\u0000District-PD-2026-01',
      },
      secondaryEvent: {
        title: timedTitle,
        startDate: '2026-10-12',
        endDate: '2026-10-12',
        startMinute: 15 * 60 + 30,
        endMinute: 16 * 60 + 15,
        timeZone: 'America/New_York',
        location: 'Conference room',
        externalKey: 'District-Meeting-2026-01',
      },
      eventCount: 2,
      assignment: {
        familyId: 'calendar-event-type',
        categoryValueId: defaultEventType.id,
        entityType: 'calendar-event',
      },
      calendarRuns: [
        expect.objectContaining({
          sourceKind: 'ics',
          schoolYearId: schoolYear.id,
          createdCount: 2,
        }),
      ],
      scheduleBlockCount: 0,
      scheduleExceptionCount: 0,
      sessionCount: 0,
      reminderCount: 0,
    });

  await page.getByRole('link', { name: 'Open Calendar' }).click();
  await expect(page).toHaveURL(/#\/calendar\?date=2026-10-12$/);
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText(timedTitle)).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(() => readCalendarImportState(page, title, timedTitle))
    .toMatchObject({
      event: undefined,
      secondaryEvent: undefined,
      eventCount: 0,
      calendarRuns: [],
    });

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect
    .poll(() => readCalendarImportState(page, title, timedTitle))
    .toMatchObject({
      event: { title },
      secondaryEvent: { title: timedTitle },
      eventCount: 2,
      calendarRuns: [expect.any(Object)],
    });
});
